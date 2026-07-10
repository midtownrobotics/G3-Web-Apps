import { sendDM, verifySlackSignature } from "@g3/slack";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db";
import { coreSlackLinkCodes } from "../db/schema";
import { handleSlackCode } from "../lib/slack-code";
import type { AppEnv } from "../types";

export const slackRouter = new Hono<AppEnv>()
  // Events API — handles DMs and URL verification challenge
  .post("/events", async (c) => {
    const rawBody = await c.req.text();

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return c.text("", 200);
    }

    // Slack URL verification challenge — no signature check required
    if (body.type === "url_verification") {
      return c.json({ challenge: body.challenge });
    }

    if (!(await verifySlackSignature(c.req.raw, rawBody, c.env))) {
      return c.text("", 200);
    }

    if (body.type !== "event_callback") return c.text("", 200);

    const event = (body.event ?? {}) as {
      type?: string;
      subtype?: string;
      bot_id?: string;
      user?: string;
      text?: string;
    };

    // Ignore non-messages, bot messages, and anything without a 6-digit code
    if (event.type !== "message" || event.subtype || event.bot_id) return c.text("", 200);

    const slackUserId = event.user ?? "";
    const text = event.text?.trim() ?? "";
    const workspaceId = (body.team_id as string) ?? "";

    if (!slackUserId || !/^\d{6}$/.test(text)) return c.text("", 200);

    c.executionCtx.waitUntil(
      (async () => {
        // Look up the code to discover its type before calling handleSlackCode
        const db = createDb(c.env.DB);
        const record = await db
          .select({ type: coreSlackLinkCodes.type })
          .from(coreSlackLinkCodes)
          .where(and(eq(coreSlackLinkCodes.code, text), eq(coreSlackLinkCodes.used, 0)))
          .get();

        if (!record) {
          await sendDM(slackUserId, "❌ Invalid or expired code. Please try again.", c.env);
          return;
        }

        const result = await handleSlackCode({
          code: text,
          slackUserId,
          workspaceId,
          type: record.type as "signin" | "link",
          env: c.env,
        });
        await sendDM(slackUserId, result.message, c.env);
      })(),
    );

    return c.text("", 200);
  })
  // /signin slash command
  .post("/commands/signin", async (c) => {
    const rawBody = await c.req.text();
    if (!(await verifySlackSignature(c.req.raw, rawBody, c.env))) return c.text("", 200);

    const params = new URLSearchParams(rawBody);
    const code = params.get("text")?.trim() ?? "";
    const slackUserId = params.get("user_id") ?? "";
    const workspaceId = params.get("team_id") ?? "";

    if (!/^\d{6}$/.test(code)) {
      return c.json({ response_type: "ephemeral", text: "Usage: `/signin 123456`" });
    }

    c.executionCtx.waitUntil(
      handleSlackCode({ code, slackUserId, workspaceId, type: "signin", env: c.env }).then(
        (result) => sendDM(slackUserId, result.message, c.env),
      ),
    );

    return c.text("", 200);
  })
  // /link slash command
  .post("/commands/link", async (c) => {
    const rawBody = await c.req.text();
    if (!(await verifySlackSignature(c.req.raw, rawBody, c.env))) return c.text("", 200);

    const params = new URLSearchParams(rawBody);
    const code = params.get("text")?.trim() ?? "";
    const slackUserId = params.get("user_id") ?? "";
    const workspaceId = params.get("team_id") ?? "";

    if (!/^\d{6}$/.test(code)) {
      return c.json({ response_type: "ephemeral", text: "Usage: `/link 123456`" });
    }

    c.executionCtx.waitUntil(
      handleSlackCode({ code, slackUserId, workspaceId, type: "link", env: c.env }).then((result) =>
        sendDM(slackUserId, result.message, c.env),
      ),
    );

    return c.text("", 200);
  });
