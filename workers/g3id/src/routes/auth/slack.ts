import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { createDb } from "../../db";
import { coreSlackLinkCodes } from "../../db/schema";
import { sessionCookieOptions } from "../../lib/cookie";
import { newId } from "../../lib/id";
import { sanitizeRedirect } from "../../lib/redirect";
import { requireAuth } from "../../middleware/auth";
import type { AppEnv } from "../../types";

export const slackAuthRouter = new Hono<AppEnv>();

function generateCode(): string {
  return (crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).toString().padStart(6, "0");
}

function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Sign-in initiation — generates code, redirects to /login/slack
slackAuthRouter.get("/slack/initiate", async (c) => {
  const redirect = sanitizeRedirect(c.req.query("redirect"));
  const code = generateCode();
  const token = generateToken();
  const now = Math.floor(Date.now() / 1000);

  await createDb(c.env.DB)
    .insert(coreSlackLinkCodes)
    .values({
      id: newId(),
      userId: null,
      code,
      type: "signin",
      pollingToken: token,
      expiresAt: now + 900,
      used: 0,
      createdAt: now,
    });

  await c.env.SESSIONS.put(`slack_pending:${token}`, "pending", { expirationTtl: 900 });

  const redirectParam = redirect ? `&redirect=${encodeURIComponent(redirect)}` : "";
  return c.redirect(
    `${c.env.FRONTEND_URL}/login/slack?token=${token}&code=${code}${redirectParam}`,
  );
});

// Link initiation — user must already be signed in, returns JSON code + token
slackAuthRouter.get("/slack/link", requireAuth, async (c) => {
  const userId = c.get("userId");
  const code = generateCode();
  const token = generateToken();
  const now = Math.floor(Date.now() / 1000);

  await createDb(c.env.DB)
    .insert(coreSlackLinkCodes)
    .values({
      id: newId(),
      userId,
      code,
      type: "link",
      pollingToken: token,
      expiresAt: now + 900,
      used: 0,
      createdAt: now,
    });

  await c.env.SESSIONS.put(`slack_pending:${token}`, "pending", { expirationTtl: 900 });

  return c.json({ code, token });
});

// Polling — frontend calls this every 2s to check sign-in / link status
slackAuthRouter.get("/slack/status", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ status: "expired" });

  const value = await c.env.SESSIONS.get(`slack_pending:${token}`);
  if (!value) return c.json({ status: "expired" });
  if (value === "pending") return c.json({ status: "pending" });

  if (value.startsWith("failed:")) {
    return c.json({ status: "failed", message: value.slice(7) });
  }

  if (value === "linked") {
    await c.env.SESSIONS.delete(`slack_pending:${token}`);
    return c.json({ status: "success", action: "linked" });
  }

  if (value === "signup_pending") {
    await c.env.SESSIONS.delete(`slack_pending:${token}`);
    return c.json({ status: "signup_pending" });
  }

  // Value is a session ID — set cookie and report success
  setCookie(c, "g3_session", value, sessionCookieOptions(c.env.FRONTEND_URL));
  await c.env.SESSIONS.delete(`slack_pending:${token}`);
  return c.json({ status: "success" });
});

// Cancel — expire the code so it cannot be redeemed
slackAuthRouter.delete("/slack/cancel", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ ok: true });

  await c.env.SESSIONS.delete(`slack_pending:${token}`);
  await createDb(c.env.DB)
    .update(coreSlackLinkCodes)
    .set({ used: 1 })
    .where(eq(coreSlackLinkCodes.pollingToken, token));

  return c.json({ ok: true });
});
