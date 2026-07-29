import { sendMessage } from "@g3/slack";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { AppEnv } from "../types";

interface BOMHeader {
  id: string;
  propertyName: string;
  label: string;
}

interface BOMRow {
  headerIdToValue: Record<string, string | number | boolean | null>;
}

interface BOMData {
  headers: BOMHeader[];
  rows: BOMRow[];
}

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

export async function processRevisionEvent(
  elementId: string,
  elementType: number,
  partNumber: string,
  onshapeReleaseId: string,
  versionId: string,
  env: AppEnv["Bindings"],
): Promise<void> {
  const database = drizzle(env.SHOP_DB, { schema });
  const now = Math.floor(Date.now() / 1000);

  const isDrawing = elementType === 2;
  const isPart = elementType === 0;

  const updateData: { entityId?: string; partDrawingEntityId?: string; versionId: string } = {
    versionId,
  };

  if (isPart) updateData.entityId = elementId;
  if (isDrawing) updateData.partDrawingEntityId = elementId;

  await database
    .insert(schema.onshapeParts)
    .values({
      onshapeReleaseId,
      partNumber,
      ...updateData,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.onshapeParts.onshapeReleaseId, schema.onshapeParts.partNumber],
      set: updateData,
    });

  console.log("[OnShape Webhook] Updated part", {
    partNumber,
    onshapeReleaseId,
    versionId,
    elementType,
  });
}

async function fetchAndParseBOM(
  documentId: string,
  versionId: string,
  mainAssemblyId: string,
  apiKey: string,
  apiSecret: string,
): Promise<Map<string, { quantity?: number; name?: string; description?: string; revision?: string }>> {
  const credentials = btoa(`${apiKey}:${apiSecret}`);
  const bomUrl = `https://cad.onshape.com/api/v16/assemblies/d/${documentId}/v/${versionId}/e/${mainAssemblyId}/bom?indented=false`;

  try {
    const response = await fetch(bomUrl, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    if (!response.ok) {
      console.error("[BOM Fetch Error]", response.status, response.statusText);
      return new Map();
    }

    const bom = (await response.json()) as BOMData;
    const partMetadata = new Map<
      string,
      { quantity?: number; name?: string; description?: string; revision?: string }
    >();

    // Find property IDs from headers
    const propertyIds: Record<string, string> = {};
    for (const header of bom.headers) {
      if (header.propertyName === "partNumber") propertyIds["partNumber"] = header.id;
      if (header.propertyName === "quantity") propertyIds["quantity"] = header.id;
      if (header.propertyName === "name") propertyIds["name"] = header.id;
      if (header.propertyName === "description") propertyIds["description"] = header.id;
      if (header.propertyName === "revision") propertyIds["revision"] = header.id;
    }

    // Parse rows to extract metadata by part number
    for (const row of bom.rows) {
      const partNumberId = propertyIds["partNumber"];
      if (partNumberId && row.headerIdToValue[partNumberId]) {
        const partNumber = String(row.headerIdToValue[partNumberId]);

        const metadata: { quantity?: number; name?: string; description?: string; revision?: string } = {};

        const quantityId = propertyIds["quantity"];
        if (quantityId && row.headerIdToValue[quantityId]) {
          const qty = row.headerIdToValue[quantityId];
          if (typeof qty === "number") metadata.quantity = qty;
        }

        const nameId = propertyIds["name"];
        if (nameId && row.headerIdToValue[nameId]) {
          const val = row.headerIdToValue[nameId];
          if (val) metadata.name = String(val);
        }

        const descriptionId = propertyIds["description"];
        if (descriptionId && row.headerIdToValue[descriptionId]) {
          const val = row.headerIdToValue[descriptionId];
          if (val) metadata.description = String(val);
        }

        const revisionId = propertyIds["revision"];
        if (revisionId && row.headerIdToValue[revisionId]) {
          const val = row.headerIdToValue[revisionId];
          if (val) metadata.revision = String(val);
        }

        if (Object.keys(metadata).length > 0) {
          partMetadata.set(partNumber, metadata);
        }
      }
    }

    return partMetadata;
  } catch (err) {
    console.error("[BOM Parse Error]", err);
    return new Map();
  }
}

export async function processReleaseEvent(
  releaseId: string,
  timestamp: string,
  env: AppEnv["Bindings"],
): Promise<void> {
  const database = drizzle(env.SHOP_DB, { schema });
  const now = Math.floor(Date.now() / 1000);

  const release = await database
    .insert(schema.onshapeReleases)
    .values({
      releaseId,
      timestamp,
      createdAt: now,
    })
    .returning({ id: schema.onshapeReleases.id });

  const releaseRowId = release[0]?.id;
  if (!releaseRowId) {
    console.error("[OnShape] Failed to create release row");
    return;
  }

  const existingParts = await database
    .select()
    .from(schema.onshapeParts)
    .where(eq(schema.onshapeParts.onshapeReleaseId, releaseId));

  for (const part of existingParts) {
    if (!part.releaseId) {
      await database
        .update(schema.onshapeParts)
        .set({ releaseId: releaseRowId })
        .where(eq(schema.onshapeParts.id, part.id));
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Query parts for this release
  const parts = await database
    .select()
    .from(schema.onshapeParts)
    .where(eq(schema.onshapeParts.releaseId, releaseRowId));

  // Get document ID and API credentials from KV storage
  const configStr = await env.SESSIONS.get("onshape-config:document");
  const config = configStr ? (JSON.parse(configStr) as { documentId?: string; mainAssemblyId?: string }) : {};
  const docId = config.documentId || "unknown";

  // Fetch BOM data if we have the necessary IDs
  if (config.documentId && config.mainAssemblyId && parts.length > 0 && parts[0]?.versionId) {
    const apiKey = env.ONSHAPE_API_KEY;
    const apiSecret = env.ONSHAPE_API_SECRET;

    if (apiKey && apiSecret) {
      const bomMetadata = await fetchAndParseBOM(
        config.documentId,
        parts[0].versionId,
        config.mainAssemblyId,
        apiKey,
        apiSecret,
      );

      // Update parts with BOM metadata
      for (const part of parts) {
        const metadata = bomMetadata.get(part.partNumber);
        if (metadata) {
          await database
            .update(schema.onshapeParts)
            .set({
              quantity: metadata.quantity ?? part.quantity,
              name: metadata.name ?? part.name,
              description: metadata.description ?? part.description,
              revision: metadata.revision ?? part.revision,
            })
            .where(eq(schema.onshapeParts.id, part.id));
        }
      }

      // Refetch parts to get updated metadata
      const updatedParts = await database
        .select()
        .from(schema.onshapeParts)
        .where(eq(schema.onshapeParts.releaseId, releaseRowId));

      // Update parts reference with fresh data
      parts.length = 0;
      parts.push(...updatedParts);
    }
  }

  // Build Slack message
  const releaseLink = `<https://cad.onshape.com/documents?releasepackage=${releaseId}|${releaseId}>`;
  const message = [
    "🎉 *New release candidate approved!*",
    `Release: ${releaseLink}`,
    `Time: <!date^${Math.floor(new Date(timestamp).getTime() / 1000)}^{date_num} {time_secs}|${timestamp}>`,
    `Parts: ${parts.length}`,
    ...parts.map((part) => {
      const partLink = part.entityId
        ? `\n    • <https://cad.onshape.com/documents/${docId}/v/${part.versionId}/e/${part.entityId}|OnShape Part Link>`
        : "";
      const drawingLink = part.partDrawingEntityId
        ? `\n    • <https://cad.onshape.com/documents/${docId}/v/${part.versionId}/e/${part.partDrawingEntityId}|OnShape Drawing Link>`
        : "";
      return `
• *${part.partNumber}*${part.revision ? ` (rev ${part.revision})` : ""}${part.name ? `- ${part.name}` : ""}${part.quantity ? ` x${part.quantity}` : ""}
    • <https://shop.g3robotics.com/part?p=${part.partNumber}|Shop SW Link>${partLink}${drawingLink}`;
    }),
  ].join("\n");

  await sendMessage("C09QYMTSGKT", message, env);

  console.log("[OnShape Webhook] Processed release", {
    releaseId,
    partCount: parts.length,
  });
}
