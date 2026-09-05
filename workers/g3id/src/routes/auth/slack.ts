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

function generateCode(): string {
  return (crypto.getRandomValues(new Uint32Array(1))[0] % 10000).toString().padStart(4, "0");
}

function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function createSlackWorkflowTrigger(
  recordId: string,
  code: string,
  env: AppEnv["Bindings"],
): Promise<string | null> {
  try {
    const response = await fetch("https://www.slack.com/api/workflows.triggers.create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        type: "link",
        description: `G3 Login Button (${code})`,
        inputs: {
          code: {
            type: "text",
            value: code,
          },
          user_id: {
            type: "slack#/types/user_id",
          },
        },
        output_channels: ["*"],
      }),
    });

    if (!response.ok) {
      console.error(`Failed to create trigger: ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;
    const triggerId = (data.trigger_id ?? null) as string | null;
    const shortcutUrl = (data.shortcut_url ?? null) as string | null;

    if (triggerId || shortcutUrl) {
      await createDb(env.DB)
        .update(coreSlackLinkCodes)
        .set({ triggerId: triggerId ?? undefined, shortcutUrl: shortcutUrl ?? undefined })
        .where(eq(coreSlackLinkCodes.id, recordId));
    }

    return shortcutUrl;
  } catch (err) {
    console.error(`Error creating trigger: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export const slackAuthRouter = new Hono<AppEnv>()
  // Sign-in initiation — generates code, creates workflow trigger, redirects to /login/slack
  .get("/slack/initiate", async (c) => {
    const redirect = sanitizeRedirect(c.req.query("redirect"));
    const code = generateCode();
    const token = generateToken();
    const now = Math.floor(Date.now() / 1000);
    const recordId = newId();

    await createDb(c.env.DB)
      .insert(coreSlackLinkCodes)
      .values({
        id: recordId,
        userId: null,
        code,
        type: "signin",
        pollingToken: token,
        expiresAt: now + 900,
        used: 0,
        createdAt: now,
      });

    const shortcutUrl = await createSlackWorkflowTrigger(recordId, code, c.env);

    const redirectParam = redirect ? `&redirect=${encodeURIComponent(redirect)}` : "";
    const slackUrlParam = shortcutUrl ? `&slackUrl=${encodeURIComponent(shortcutUrl)}` : "";
    return c.redirect(
      `${c.env.FRONTEND_URL}/login/slack?token=${token}&code=${code}${slackUrlParam}${redirectParam}`,
    );
  })
  // Link initiation — user must already be signed in, returns JSON code + token
  .get("/slack/link", requireAuth, async (c) => {
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

    return c.json({ code, token });
  })
  // Polling — frontend calls this every 2s to check sign-in / link status
  .get("/slack/status", async (c) => {
    const token = c.req.query("token");
    if (!token) return c.json({ status: "expired" });

    const db = createDb(c.env.DB);
    const record = await db
      .select()
      .from(coreSlackLinkCodes)
      .where(eq(coreSlackLinkCodes.pollingToken, token))
      .get();

    if (!record) return c.json({ status: "expired" });
    if (record.status === "pending") return c.json({ status: "pending" });

    if (record.status === "failed") {
      return c.json({ status: "failed", message: record.statusMessage || "Unknown error" });
    }

    if (record.status === "linked") {
      return c.json({ status: "success", action: "linked" });
    }

    if (record.status === "signup_pending") {
      return c.json({ status: "signup_pending" });
    }

    // Status is 'success' with a session ID — set cookie and report success
    if (record.status === "success" && record.sessionId) {
      setCookie(c, "g3_session", record.sessionId, sessionCookieOptions(c.env.FRONTEND_URL));
      return c.json({ status: "success" });
    }

    return c.json({ status: "expired" });
  })
  // Cancel — expire the code so it cannot be redeemed
  .delete("/slack/cancel", async (c) => {
    const token = c.req.query("token");
    if (!token) return c.json({ ok: true });

    await createDb(c.env.DB)
      .update(coreSlackLinkCodes)
      .set({ used: 1 })
      .where(eq(coreSlackLinkCodes.pollingToken, token));

    return c.json({ ok: true });
  });
