import { sendMessage } from "@g3/slack";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { AppEnv } from "../types";
import { fetchAndParseBOM } from "./onshape-webhook";

export interface BOMQueueMessage {
  releaseId: string;
  releaseRowId: number;
  timestamp: string;
}

export async function processBOMQueue(
  jobData: BOMQueueMessage,
  env: AppEnv["Bindings"],
): Promise<void> {
  await processSingleBOMJob(jobData, env);
}

async function processSingleBOMJob(
  jobData: BOMQueueMessage,
  env: AppEnv["Bindings"],
): Promise<void> {
  const jobStartTime = Date.now();
  const { releaseId, releaseRowId, timestamp } = jobData;

  console.log(`[BOM Queue Job] Starting for release ${releaseId}`);

  const database = drizzle(env.SHOP_DB, { schema });

  // Query parts for this release
  console.log("[BOM Queue Job] Querying parts for release");
  const parts = await database
    .select()
    .from(schema.onshapeParts)
    .where(eq(schema.onshapeParts.releaseId, releaseRowId));

  console.log(`[BOM Queue Job] Found ${parts.length} parts`);

  if (parts.length === 0) {
    console.log("[BOM Queue Job] No parts found, skipping BOM fetch");
    return;
  }

  // Get document ID and API credentials from KV storage
  const configStr = await env.SESSIONS.get("onshape-config:document");
  const config = configStr
    ? (JSON.parse(configStr) as { documentId?: string; mainAssemblyId?: string })
    : {};
  const docId = config.documentId || "unknown";

  // Fetch BOM data if we have the necessary IDs
  if (config.documentId && config.mainAssemblyId && parts[0]?.versionId) {
    const apiKey = env.ONSHAPE_API_KEY;
    const apiSecret = env.ONSHAPE_API_SECRET;

    if (apiKey && apiSecret) {
      console.log(`[BOM Queue Job] [${Date.now() - jobStartTime}ms] Fetching BOM data`);
      const bomMetadata = await fetchAndParseBOM(
        config.documentId,
        parts[0].versionId,
        config.mainAssemblyId,
        apiKey,
        apiSecret,
      );
      console.log(
        `[BOM Queue Job] [${Date.now() - jobStartTime}ms] BOM fetch complete, updating ${parts.length} parts`,
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
      console.log(`[BOM Queue Job] [${Date.now() - jobStartTime}ms] Refetching updated parts`);
      const updatedParts = await database
        .select()
        .from(schema.onshapeParts)
        .where(eq(schema.onshapeParts.releaseId, releaseRowId));

      // Build and send Slack message with BOM data
      console.log(`[BOM Queue Job] [${Date.now() - jobStartTime}ms] Building Slack message`);
      const releaseLink = `<https://cad.onshape.com/documents?releasepackage=${releaseId}|${releaseId}>`;
      const message = [
        "🎉 *New release candidate approved!*",
        `Release: ${releaseLink}`,
        `Time: <!date^${Math.floor(new Date(timestamp).getTime() / 1000)}^{date_num} {time_secs}|${timestamp}>`,
        `Parts: ${updatedParts.length}`,
        ...updatedParts.map((part) => {
          const partLink = part.entityId
            ? `\n    • <https://cad.onshape.com/documents/${docId}/v/${part.versionId}/e/${part.entityId}|OnShape Part Link>`
            : "";
          const drawingLink = part.partDrawingEntityId
            ? `\n    • <https://cad.onshape.com/documents/${docId}/v/${part.versionId}/e/${part.partDrawingEntityId}|OnShape Drawing Link>`
            : "";
          return `
  • *${part.partNumber}*${part.name ? ` - "${part.name}"` : ""}${part.quantity ? ` (x${part.quantity})` : ""}
    ${part.revision ? `• Revision: ${part.revision}` : ""}
    • <https://shop.g3robotics.com/part?p=${part.partNumber}|Shop SW Link>${partLink}${drawingLink}
          `;
        }),
        "\nClick <https://shop.g3robotics.com/ingest|here> to open the Shop SW part ingest page.",
      ].join("\n");

      console.log(`[BOM Queue Job] [${Date.now() - jobStartTime}ms] Sending Slack message`);
      await sendMessage("C09QYMTSGKT", message, env);
    }
  }

  const totalTime = Date.now() - jobStartTime;
  console.log("[BOM Queue Job] Complete", {
    releaseId,
    partCount: parts.length,
    totalTimeMs: totalTime,
  });
}
