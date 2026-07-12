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

function buildGoogleUrl(env: AppEnv["Bindings"], state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function generateState(env: AppEnv["Bindings"], value: string): Promise<string> {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await env.RATE_LIMIT.put(`oauth_state:${state}`, value, { expirationTtl: 600 });
  return state;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64));
}

export const googleAuthRouter = new Hono<AppEnv>()
  // Sign-in initiation
  .get("/google", async (c) => {
    const redirect = sanitizeRedirect(c.req.query("redirect"));
    const stateValue = redirect ? `signin:${redirect}` : "signin";
    const state = await generateState(c.env, stateValue);
    return c.redirect(buildGoogleUrl(c.env, state));
  })
  // Link initiation — user must already be signed in
  .get("/google/link", async (c) => {
    const app = (path: string) => `${c.env.FRONTEND_URL}${path}`;
    const userId = await resolveUserId(c.req.header("Cookie") ?? "", c.env);
    if (!userId) return c.redirect(app("/login"));

    const state = await generateState(c.env, `link:${userId}`);
    return c.redirect(buildGoogleUrl(c.env, state));
  })
  // Shared callback
  .get("/google/callback", async (c) => {
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

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: c.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) return err("Failed to complete sign-in with Google. Please try again.");

    const tokens = (await tokenRes.json()) as {
      id_token: string;
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const payload = decodeJwtPayload(tokens.id_token);
    const sub = payload.sub as string;

    const db = createDb(c.env.DB);
    const now = Math.floor(Date.now() / 1000);

    const identityValues = {
      id: newId(),
      provider: "google" as const,
      providerId: sub,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiresAt: now + tokens.expires_in,
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
          and(eq(coreUserIdentities.provider, "google"), eq(coreUserIdentities.providerId, sub)),
        )
        .get();

      if (existingIdentity) {
        if (existingIdentity.userId === linkUserId) {
          return c.redirect(app("/dashboard")); // already linked, no-op
        }
        return err("This Google account is already linked to a different account.");
      }

      await db.insert(coreUserIdentities).values({ ...identityValues, userId: linkUserId });
      return c.redirect(app("/dashboard"));
    }

    // --- Sign-in flow ---
    const identity = await db
      .select({ userId: coreUserIdentities.userId })
      .from(coreUserIdentities)
      .where(and(eq(coreUserIdentities.provider, "google"), eq(coreUserIdentities.providerId, sub)))
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

    // No Google identity found — account must already exist
    return err(
      "No account found with this Google account. Sign up with Slack or contact an administrator.",
    );
  });
