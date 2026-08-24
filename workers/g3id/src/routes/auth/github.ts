import { resolveUserId } from "@g3/auth";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { createDb } from "../../db";
import { coreUserIdentities, coreUsers } from "../../db/schema";
import { sessionCookieOptions } from "../../lib/cookie";
import { newId } from "../../lib/id";
import { sanitizeRedirect } from "../../lib/redirect";
import { createSession } from "../../lib/session";
import type { AppEnv } from "../../types";

function buildGithubUrl(env: AppEnv["Bindings"], state: string): string {
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: env.GITHUB_REDIRECT_URI,
    scope: "read:user user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

async function generateState(env: AppEnv["Bindings"], value: string): Promise<string> {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await env.RATE_LIMIT.put(`oauth_state:${state}`, value, { expirationTtl: 600 });
  return state;
}

async function getGithubUser(
  accessToken: string,
): Promise<{ id: string; login: string; email: string | null; name: string }> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "g3id-worker",
  };

  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) throw new Error("Failed to fetch GitHub user.");
  const user = (await userRes.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
  };

  let email = user.email;

  // Email is null if the user has set it to private — fetch from the emails endpoint
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as {
        email: string;
        primary: boolean;
        verified: boolean;
      }[];
      email = emails.find((e) => e.primary && e.verified)?.email ?? null;
    }
  }

  return {
    id: String(user.id),
    login: user.login,
    email,
    name: user.name ?? user.login,
  };
}

export const githubAuthRouter = new Hono<AppEnv>()
  // Sign-in initiation
  .get("/github", async (c) => {
    const redirect = sanitizeRedirect(c.req.query("redirect"));
    const stateValue = redirect ? `signin:${redirect}` : "signin";
    const state = await generateState(c.env, stateValue);
    return c.redirect(buildGithubUrl(c.env, state));
  })
  // Link initiation — user must already be signed in
  .get("/github/link", async (c) => {
    const app = (path: string) => `${c.env.FRONTEND_URL}${path}`;
    const userId = await resolveUserId(c.req.header("Cookie") ?? "", c.env);
    if (!userId) return c.redirect(app("/login"));

    const state = await generateState(c.env, `link:${userId}`);
    return c.redirect(buildGithubUrl(c.env, state));
  })
  // Shared callback
  .get("/github/callback", async (c) => {
    const app = (path: string) => `${c.env.FRONTEND_URL}${path}`;
    const oauthError = c.req.query("error");
    const code = c.req.query("code");
    const state = c.req.query("state");

    const err = (msg: string) => c.redirect(app(`/login/error?error=${encodeURIComponent(msg)}`));

    if (oauthError) return err("Sign-in was cancelled or denied.");
    if (!code || !state) return err("Missing code or state.");

    const stateValue = await c.env.RATE_LIMIT.get(`oauth_state:${state}`);
    await c.env.RATE_LIMIT.delete(`oauth_state:${state}`);
    if (!stateValue) return err("This sign-in link has expired. Please try again.");

    const isLink = stateValue.startsWith("link:");
    const linkUserId = isLink ? stateValue.slice(5) : null;
    const redirectTo = !isLink && stateValue.startsWith("signin:") ? stateValue.slice(7) : null;

    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: c.env.GITHUB_CLIENT_ID,
        client_secret: c.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: c.env.GITHUB_REDIRECT_URI,
      }),
    });

    const tokenBodyText = await tokenRes.text();

    if (!tokenRes.ok) {
      console.error("[github oauth] token exchange failed", tokenRes.status, tokenBodyText);
      return err("Failed to complete sign-in with GitHub. Please try again.");
    }

    let accessToken: string | undefined;
    try {
      ({ access_token: accessToken } = JSON.parse(tokenBodyText) as { access_token?: string });
    } catch {
      console.error("[github oauth] token response was not valid JSON", tokenBodyText);
      return err("Failed to complete sign-in with GitHub. Please try again.");
    }

    if (!accessToken) {
      // GitHub returns HTTP 200 with an error body (e.g. redirect_uri_mismatch,
      // bad_verification_code, incorrect_client_credentials) instead of a 4xx.
      console.error("[github oauth] no access_token in response", tokenBodyText);
      return err("Failed to complete sign-in with GitHub. Please try again.");
    }

    let githubUser: { id: string; login: string; email: string | null; name: string };
    try {
      githubUser = await getGithubUser(accessToken);
    } catch {
      return err("Failed to fetch your GitHub profile. Please try again.");
    }

    if (!githubUser.email) {
      return err(
        "Your GitHub account has no verified public email. Add a public email in your GitHub settings and try again.",
      );
    }

    const sub = githubUser.id;

    const db = createDb(c.env.DB);
    const now = Math.floor(Date.now() / 1000);

    const identityValues = {
      id: newId(),
      provider: "github" as const,
      providerId: sub,
      providerEmail: githubUser.login,
      accessToken,
      createdAt: now,
      updatedAt: now,
    };

    // --- Link flow ---
    if (isLink && linkUserId) {
      const linkUser = await db
        .select({ id: coreUsers.id, status: coreUsers.status })
        .from(coreUsers)
        .where(eq(coreUsers.id, linkUserId))
        .get();

      if (!linkUser || linkUser.status !== "active") {
        return err("Your account is not active.");
      }

      const existingIdentity = await db
        .select({ userId: coreUserIdentities.userId })
        .from(coreUserIdentities)
        .where(
          and(eq(coreUserIdentities.provider, "github"), eq(coreUserIdentities.providerId, sub)),
        )
        .get();

      if (existingIdentity) {
        if (existingIdentity.userId === linkUserId) return c.redirect(app("/dashboard"));
        return err("This GitHub account is already linked to a different account.");
      }

      await db.insert(coreUserIdentities).values({ ...identityValues, userId: linkUserId });
      return c.redirect(app("/dashboard"));
    }

    // --- Sign-in flow ---
    // --- Sign-in flow ---
    const identity = await db
      .select({ userId: coreUserIdentities.userId })
      .from(coreUserIdentities)
      .where(and(eq(coreUserIdentities.provider, "github"), eq(coreUserIdentities.providerId, sub)))
      .get();

    if (identity) {
      const user = await db
        .select({ id: coreUsers.id, status: coreUsers.status })
        .from(coreUsers)
        .where(eq(coreUsers.id, identity.userId))
        .get();

      if (!user || user.status !== "active") {
        const message =
          user?.status === "pending"
            ? "Your account is awaiting admin approval."
            : "Your account is not active.";
        return err(message);
      }

      const sessionId = await createSession(user.id, c.env);
      setCookie(c, "g3_session", sessionId, sessionCookieOptions(c.env.FRONTEND_URL));
      return c.redirect(redirectTo ?? app("/dashboard"));
    }

    // --- Account Provisioning (New User Registration) ---
    // If no existing account matches the GitHub ID, verify the email isn't registered elsewhere
    const existingUserByEmail = await db
      .select({ id: coreUsers.id, status: coreUsers.status })
      .from(coreUsers)
      .where(eq(coreUsers.email, githubUser.email))
      .get();

    let targetUserId: string;

    if (existingUserByEmail) {
      if (existingUserByEmail.status !== "active") {
        return err("Your matching email account is not active or is pending approval.");
      }
      targetUserId = existingUserByEmail.id;
    } else {
      // Completely new user registration
      targetUserId = newId();
      await db.insert(coreUsers).values({
        id: targetUserId,
        email: githubUser.email,
        displayName: githubUser.name, //  Fixed to match database schema
        status: "active", 
        createdAt: now,
        updatedAt: now,
      });
    }

    // Link the new/existing user to this GitHub Identity
    await db.insert(coreUserIdentities).values({
      ...identityValues,
      userId: targetUserId,
    });

    const sessionId = await createSession(targetUserId, c.env);
    setCookie(c, "g3_session", sessionId, sessionCookieOptions(c.env.FRONTEND_URL));
    return c.redirect(redirectTo ?? app("/dashboard"));
  });
