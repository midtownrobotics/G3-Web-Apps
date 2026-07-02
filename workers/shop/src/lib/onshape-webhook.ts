import type { AppEnv } from "../types";

export const ONSHAPE_WEBHOOK_EVENTS = ["onshape.revision.created", "onshape.workflow.transition"];

export async function verifyOnshapeSignature(
  timestamp: string,
  rawBody: string,
  primaryKey: string,
  secondaryKey: string,
  primarySignature: string,
  secondarySignature: string,
): Promise<boolean> {
  const message = `${timestamp}.${rawBody}`;

  const verifyKey = async (key: string, signature: string): Promise<boolean> => {
    try {
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(key),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );

      const signatureBytes = await crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        new TextEncoder().encode(message),
      );

      const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

      return base64Signature === signature;
    } catch {
      return false;
    }
  };

  const primaryMatch = await verifyKey(primaryKey, primarySignature);
  if (primaryMatch) return true;

  const secondaryMatch = await verifyKey(secondaryKey, secondarySignature);
  return secondaryMatch;
}

export async function registerOnShapeWebhook(documentId: string, env: AppEnv["Bindings"]) {
  const apiKey = env.ONSHAPE_API_KEY;
  const apiSecret = env.ONSHAPE_API_SECRET;
  const companyId = env.ONSHAPE_COMPANY_ID;

  if (!apiKey || !apiSecret || !companyId) {
    throw new Error("OnShape API credentials not configured");
  }

  const credentials = btoa(`${apiKey}:${apiSecret}`);
  const webhookUrl = "https://api.shop.g3robotics.com/onshape/events";

  const response = await fetch("https://cad.onshape.com/api/v16/webhooks", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      documentId,
      companyId,
      events: ONSHAPE_WEBHOOK_EVENTS,
      url: webhookUrl,
      isTransient: false,
      options: {
        collapseEvents: false,
      },
      name: "G3 Robotics Shop SW",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[OnShape Webhook Register Error]", error);
    throw new Error(`Failed to register OnShape webhook: ${response.status}`);
  }

  const data = (await response.json()) as { id: string };
  console.log("[OnShape Webhook Registered]", {
    documentId,
    webhookId: data.id,
    events: ONSHAPE_WEBHOOK_EVENTS,
  });
  return data;
}
