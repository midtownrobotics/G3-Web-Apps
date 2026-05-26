import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createDb } from "../../db";
import { coreUserIdentities, coreUsers } from "../../db/schema";
import { sessionCookieOptions } from "../../lib/cookie";
import { sanitizeRedirect } from "../../lib/redirect";
import { createSession, getSession } from "../../lib/session";
import type { AppEnv } from "../../types";

export const steamAuthRouter = new Hono<AppEnv>();

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";
const STEAM_ID_REGEX = /https:\/\/steamcommunity\.com\/openid\/id\/(\d+)/;

async function generateState(env: AppEnv["Bindings"], value: string): Promise<string> {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await env.RATE_LIMIT.put(`oauth_state:${state}`, value, { expirationTtl: 600 });
  return state;
}

function buildSteamUrl(redirectUri: string, state: string): string {
  const returnTo = `${redirectUri}?state=${state}`;
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": new URL(redirectUri).origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID_URL}?${params}`;
}

// Sign-in initiation
steamAuthRouter.get("/steam", async (c) => {
  const redirect = sanitizeRedirect(c.req.query("redirect"));
  const stateValue = redirect ? `signin:${redirect}` : "signin";
  const state = await generateState(c.env, stateValue);
  return c.redirect(buildSteamUrl(c.env.STEAM_REDIRECT_URI, state));
});

// Link initiation — user must already be signed in
steamAuthRouter.get("/steam/link", async (c) => {
  const app = (path: string) => `${c.env.FRONTEND_URL}${path}`;
  const sessionId = getCookie(c, "g3_session");
  if (!sessionId) return c.redirect(app("/login"));

  const userId = await getSession(sessionId, c.env);
  if (!userId) return c.redirect(app("/login"));

  const state = await generateState(c.env, `link:${userId}`);
  return c.redirect(buildSteamUrl(c.env.STEAM_REDIRECT_URI, state));
});

// Shared callback
steamAuthRouter.get("/steam/callback", async (c) => {
  const app = (path: string) => `${c.env.FRONTEND_URL}${path}`;
  const err = (msg: string) => c.redirect(app(`/login/error?error=${encodeURIComponent(msg)}`));

  const state = c.req.query("state");
  if (!state) return err("Missing state parameter.");

  const stateValue = await c.env.RATE_LIMIT.get(`oauth_state:${state}`);
  await c.env.RATE_LIMIT.delete(`oauth_state:${state}`);
  if (!stateValue) return err("This sign-in link has expired. Please try again.");

  const isLink = stateValue.startsWith("link:");
  const linkUserId = isLink ? stateValue.slice(5) : null;
  const redirectTo = !isLink && stateValue.startsWith("signin:") ? stateValue.slice(7) : null;

  const claimedId = c.req.query("openid.claimed_id");
  if (!claimedId) return err("Invalid OpenID response.");

  const match = STEAM_ID_REGEX.exec(claimedId);
  if (!match) return err("Invalid Steam identity.");
  const steamId = match[1];

  // Verify with Steam — always POST to the hardcoded endpoint, never trust openid.op_endpoint
  const verifyParams = new URLSearchParams({ "openid.mode": "check_authentication" });
  for (const [key, value] of Object.entries(c.req.query())) {
    if (key !== "state" && key !== "openid.mode") {
      verifyParams.set(key, value as string);
    }
  }

  const verifyRes = await fetch(STEAM_OPENID_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: verifyParams.toString(),
  });

  if (!verifyRes.ok) return err("Failed to verify Steam sign-in. Please try again.");
  const verifyText = await verifyRes.text();
  if (!verifyText.includes("is_valid:true")) {
    return err("Steam sign-in could not be verified. Please try again.");
  }

  const db = createDb(c.env.DB);

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
        and(eq(coreUserIdentities.provider, "steam"), eq(coreUserIdentities.providerId, steamId)),
      )
      .get();

    if (existingIdentity) {
      if (existingIdentity.userId === linkUserId) return c.redirect(app("/dashboard"));
      return err("This Steam account is already linked to a different account.");
    }

    const now = Math.floor(Date.now() / 1000);
    await db.insert(coreUserIdentities).values({
      id: crypto.randomUUID(),
      userId: linkUserId,
      provider: "steam",
      providerId: steamId,
      createdAt: now,
      updatedAt: now,
    });
    return c.redirect(app("/dashboard"));
  }

  // --- Sign-in flow ---
  const identity = await db
    .select({ userId: coreUserIdentities.userId })
    .from(coreUserIdentities)
    .where(
      and(eq(coreUserIdentities.provider, "steam"), eq(coreUserIdentities.providerId, steamId)),
    )
    .get();

  if (!identity) {
    return c.redirect(
      app(
        `/login?error=${encodeURIComponent("You need to link Steam from your account settings first.")}`,
      ),
    );
  }

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
});
