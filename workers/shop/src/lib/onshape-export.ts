import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { AppEnv } from "../types";

export async function drawingExistsInR2(
  partNumber: string,
  env: AppEnv["Bindings"],
): Promise<boolean> {
  const r2Key = `drawings/${partNumber}.pdf`;
  try {
    const obj = await env.DRAWINGS.head(r2Key);
    return obj !== null;
  } catch {
    return false;
  }
}

export async function retrieveDrawingFromR2(
  partNumber: string,
  env: AppEnv["Bindings"],
): Promise<ArrayBuffer> {
  const r2Key = `drawings/${partNumber}.pdf`;
  const obj = await env.DRAWINGS.get(r2Key);
  if (!obj) {
    throw new Error(`Drawing not found in R2: ${partNumber}`);
  }
  return obj.arrayBuffer();
}

export async function storeDrawingInR2(
  partNumber: string,
  pdfBuffer: ArrayBuffer,
  env: AppEnv["Bindings"],
): Promise<string> {
  const r2Key = `drawings/${partNumber}.pdf`;
  await env.DRAWINGS.put(r2Key, pdfBuffer, {
    httpMetadata: {
      contentType: "application/pdf",
    },
  });
  console.log("[OnShape Export] Stored drawing in R2", {
    partNumber,
    r2Key,
    size: pdfBuffer.byteLength,
  });
  return r2Key;
}

export async function getDrawingExportParams(
  partNumber: string,
  env: AppEnv["Bindings"],
): Promise<{ documentId: string; versionId: string; drawingEntityId: string }> {
  // Get document ID from KV
  const configStr = await env.SESSIONS.get("onshape-config:document");
  const config = configStr ? (JSON.parse(configStr) as { documentId?: string }) : {};
  const documentId = config.documentId;

  if (!documentId) {
    throw new Error("Document ID not configured in KV storage");
  }

  // Get part info from database (most recent)
  const db = drizzle(env.SHOP_DB, { schema });
  const part = await db
    .select()
    .from(schema.onshapeParts)
    .where(eq(schema.onshapeParts.partNumber, partNumber))
    .orderBy(desc(schema.onshapeParts.createdAt))
    .get();

  if (!part) {
    throw new Error(`Part not found: ${partNumber}`);
  }

  if (!part.partDrawingEntityId) {
    throw new Error(`Part drawing entity ID not available for: ${partNumber}`);
  }

  if (!part.versionId) {
    throw new Error(`Part version ID not available for: ${partNumber}`);
  }

  return {
    documentId,
    versionId: part.versionId,
    drawingEntityId: part.partDrawingEntityId,
  };
}

export async function exportDrawingAsPDF(
  documentId: string,
  versionId: string,
  drawingEntityId: string,
  env: AppEnv["Bindings"],
): Promise<ArrayBuffer> {
  const apiKey = env.ONSHAPE_API_KEY;
  const apiSecret = env.ONSHAPE_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("OnShape API credentials not configured");
  }

  const credentials = btoa(`${apiKey}:${apiSecret}`);

  // Step 1: Request PDF export
  console.log("[OnShape Export] Requesting PDF export", { documentId, versionId, drawingEntityId });

  const exportResponse = await fetch(
    `https://cad.onshape.com/api/v16/drawings/d/${documentId}/v/${versionId}/e/${drawingEntityId}/translations`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        formatName: "PDF",
        storeInDocument: false,
      }),
    },
  );

  if (!exportResponse.ok) {
    const error = await exportResponse.text();
    console.error("[OnShape Export] Failed to request export", error);
    throw new Error(`Failed to request PDF export: ${exportResponse.status}`);
  }

  const exportData = (await exportResponse.json()) as {
    id: string;
    requestState: string;
    resultExternalDataIds?: string[];
  };

  const translationId = exportData.id;
  console.log("[OnShape Export] Export requested", { translationId });

  // Step 2: Wait before first poll (export needs time to process)
  console.log("[OnShape Export] Waiting 15 seconds before polling...");
  await new Promise((resolve) => setTimeout(resolve, 15000));

  let translationStatus: {
    id: string;
    requestState: string;
    resultExternalDataIds?: string[];
    failureReason?: string;
  } = { ...exportData, failureReason: undefined };
  let retries = 0;
  const maxRetries = 1;

  while (translationStatus.requestState !== "DONE" && retries <= maxRetries) {
    if (retries > 0) {
      console.log("[OnShape Export] Waiting 15 seconds before retry...");
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }

    console.log("[OnShape Export] Polling status", { translationId, attempt: retries + 1 });

    const statusResponse = await fetch(
      `https://cad.onshape.com/api/v16/translations/${translationId}`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      },
    );

    if (!statusResponse.ok) {
      const error = await statusResponse.text();
      console.error("[OnShape Export] Failed to get status", error);
      throw new Error(`Failed to get export status: ${statusResponse.status}`);
    }

    translationStatus = (await statusResponse.json()) as {
      id: string;
      requestState: string;
      resultExternalDataIds?: string[];
      failureReason?: string;
    };

    retries++;
  }

  if (translationStatus.requestState !== "DONE") {
    const failureReason = translationStatus.failureReason || "Unknown error";
    console.error("[OnShape Export] Export failed or timed out", failureReason);
    throw new Error(`PDF export failed: ${failureReason}`);
  }

  if (
    !translationStatus.resultExternalDataIds ||
    translationStatus.resultExternalDataIds.length === 0
  ) {
    console.error("[OnShape Export] No external data IDs in response");
    throw new Error("No PDF data returned from export");
  }

  const externalDataId = translationStatus.resultExternalDataIds[0];
  console.log("[OnShape Export] Export complete, downloading PDF", { externalDataId });

  // Step 3: Download the PDF
  const downloadResponse = await fetch(
    `https://cad.onshape.com/api/v16/documents/d/${documentId}/externaldata/${externalDataId}`,
    {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    },
  );

  if (!downloadResponse.ok) {
    const error = await downloadResponse.text();
    console.error("[OnShape Export] Failed to download PDF", error);
    throw new Error(`Failed to download PDF: ${downloadResponse.status}`);
  }

  const pdfBuffer = await downloadResponse.arrayBuffer();
  console.log("[OnShape Export] PDF downloaded successfully", { size: pdfBuffer.byteLength });

  return pdfBuffer;
}
