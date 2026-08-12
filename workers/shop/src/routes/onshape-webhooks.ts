import { Hono } from "hono";
import {
  processReleaseEvent,
  processRevisionEvent,
  registerOnShapeWebhook,
  verifyOnshapeSignature,
} from "../lib/onshape-webhook";
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

  const webhookData = body as {
    event?: string;
    elementType?: number;
    elementId?: string;
    partNumber?: string;
    releaseId?: string;
    versionId?: string;
    objectType?: string;
    objectId?: string;
    timestamp?: string;
    transitionName?: string;
  };

  if (typeof webhookData !== "object" || !webhookData || !webhookData.event) {
    return c.json({ ok: true });
  }

  console.log("[OnShape Webhook]", webhookData.event, webhookData);

  if (webhookData.event === "webhook.register" || webhookData.event === "webhook.ping") {
    return c.json({ ok: true });
  }

  if (webhookData.event === "onshape.revision.created") {
    const { elementType, elementId, partNumber, releaseId, versionId } = webhookData;
    if (typeof elementType === "number" && elementId && partNumber && releaseId && versionId) {
      c.executionCtx.waitUntil(
        processRevisionEvent(elementId, elementType, partNumber, releaseId, versionId, c.env),
      );
    }
    return c.json({ ok: true });
  }

  if (
    webhookData.event === "onshape.workflow.transition" &&
    webhookData.objectType === "RELEASE" &&
    webhookData.transitionName === "RELEASE"
  ) {
    const { objectId: releaseId, timestamp } = webhookData;
    if (releaseId && timestamp) {
      c.executionCtx.waitUntil(processReleaseEvent(releaseId, timestamp, c.env, c.env.BOM_QUEUE));
    }
    return c.json({ ok: true });
  }

  return c.json({ ok: true });
});

router.get("/register", async (c) => {
  const url = c.req.query("url");

  if (!url) {
    return c.json({ error: "url query parameter is required" }, 400);
  }

  const match = url.match(
    /https:\/\/cad\.onshape\.com\/documents\/([a-f0-9]+)\/w\/([a-f0-9]+)\/e\/([a-f0-9]+)/,
  );

  if (!match || !match[1] || !match[2] || !match[3]) {
    return c.json(
      {
        error:
          "Invalid URL format. Expected: https://cad.onshape.com/documents/[DOCID]/w/[WORKSPACE]/e/[MAIN ASSEMBLY]",
      },
      400,
    );
  }

  const documentId = match[1];
  const workspaceId = match[2];
  const mainAssemblyId = match[3];

  try {
    // Verify element is an assembly
    const credentials = btoa(`${c.env.ONSHAPE_API_KEY}:${c.env.ONSHAPE_API_SECRET}`);
    const metadataUrl = `https://cad.onshape.com/api/v6/metadata/d/${documentId}/w/${workspaceId}/e/${mainAssemblyId}`;

    const metadataResponse = await fetch(metadataUrl, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    if (!metadataResponse.ok) {
      return c.json({ error: `Failed to fetch element metadata: ${metadataResponse.status}` }, 400);
    }

    const metadata = (await metadataResponse.json()) as { elementType?: number };

    if (metadata.elementType !== 1) {
      return c.json({ error: "Element is not an assembly (elementType must be 1)" }, 400);
    }

    const result = await registerOnShapeWebhook(documentId, c.env);
    await c.env.SESSIONS.put(
      "onshape-config:document",
      JSON.stringify({ documentId, mainAssemblyId }),
    );
    return c.json({ success: true, documentId, workspaceId, mainAssemblyId, webhook: result });
  } catch (err) {
    console.error("[OnShape Register Dev Error]", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Failed to register webhook" },
      500,
    );
  }
});

export const onshapeWebhooksRouter = router;
