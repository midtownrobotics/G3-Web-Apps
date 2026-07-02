import { Hono } from "hono";
import { registerOnShapeWebhook, verifyOnshapeSignature } from "../lib/onshape-webhook";
import type { AppEnv } from "../types";

const router = new Hono<AppEnv>();

router.post("/events", async (c) => {
  const timestamp = c.req.header("X-onshape-webhook-timestamp");
  const primarySignature = c.req.header("X-onshape-webhook-signature-primary");
  const secondarySignature = c.req.header("X-onshape-webhook-signature-secondary");

  if (!timestamp || !primarySignature || !secondarySignature) {
    console.error("[OnShape Webhook] Missing signature headers");
    return c.json({ ok: true });
  }

  let rawBody: string;
  try {
    rawBody = await c.req.text();
  } catch {
    console.error("[OnShape Webhook] Failed to read raw body");
    return c.json({ ok: true });
  }

  const isValid = await verifyOnshapeSignature(
    timestamp,
    rawBody,
    c.env.ONSHAPE_WEBHOOK_KEY_PRIMARY,
    c.env.ONSHAPE_WEBHOOK_KEY_SECONDARY,
    primarySignature,
    secondarySignature,
  );

  if (!isValid) {
    console.error("[OnShape Webhook] Invalid signature");
    return c.json({ ok: true });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error("[OnShape Webhook] Failed to parse body");
    return c.json({ ok: true });
  }

  const webhookData = body as { webhook?: { eventType?: string } };
  const eventType = webhookData.webhook?.eventType;

  if (eventType === "webhook.register" || eventType === "webhook.ping") {
    console.log("[OnShape Webhook] Registration ping received");
    return c.json({ ok: true });
  }

  if (eventType === "onshape.revision.created") {
    c.executionCtx.waitUntil(
      (async () => {
        console.log("[OnShape Webhook] Processing revision.created event", webhookData);
      })(),
    );
    return c.json({ ok: true });
  }

  if (eventType === "onshape.workflow.transition") {
    c.executionCtx.waitUntil(
      (async () => {
        console.log("[OnShape Webhook] Processing workflow.transition event", webhookData);
      })(),
    );
    return c.json({ ok: true });
  }

  console.log("[OnShape Webhook] Ignoring event type", eventType);
  return c.json({ ok: true });
});

router.get("/register-dev", async (c) => {
  const documentId = c.req.query("documentId");

  if (!documentId) {
    return c.json({ error: "documentId query parameter is required" }, 400);
  }

  try {
    const result = await registerOnShapeWebhook(documentId, c.env);
    return c.json({ success: true, ...result });
  } catch (err) {
    console.error("[OnShape Register Dev Error]", err);
    return c.json({ error: err instanceof Error ? err.message : "Failed to register webhook" }, 500);
  }
});

export const onshapeWebhooksRouter = router;
