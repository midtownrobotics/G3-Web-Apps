import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createShopDb } from "../db";
import * as schema from "../db/schema";
import { exportDrawingAsPDF } from "../lib/onshape-export";
import { requireAdmin, requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const router = new Hono<AppEnv>();

router.get("/parts/pending", requireAuth, async (c) => {
  const db = createShopDb(c.env.SHOP_DB);

  // Get all parts from onshapeParts and partDefinitions
  const onshapeParts = await db.select().from(schema.onshapeParts).all();
  const definitions = await db.select().from(schema.partDefinitions).all();

  // Normalize timestamps to seconds for consistent comparison
  const toSeconds = (ts: number) => (ts > 10000000000 ? Math.floor(ts / 1000) : ts);

  // Create a map of part number to their definition's createdAt (in seconds)
  const definitionsByNumber = new Map<string, number>();
  for (const def of definitions) {
    const defSeconds = toSeconds(def.createdAt);
    const existing = definitionsByNumber.get(def.onshapePartNumber);
    // Keep the most recent definition's createdAt for each part number
    if (!existing || defSeconds > existing) {
      definitionsByNumber.set(def.onshapePartNumber, defSeconds);
    }
  }

  // Filter to parts that are either:
  // 1. Don't have a definition yet, OR
  // 2. Are newer than their definition (createdAt > definition's createdAt)
  const unfilteredPending = onshapeParts.filter((p) => {
    const partSeconds = toSeconds(p.createdAt);
    const defSeconds = definitionsByNumber.get(p.partNumber);
    // Keep if no definition exists, or if this part is newer than the definition
    return !defSeconds || partSeconds > defSeconds;
  });

  // Keep only the most recent version of each part (by createdAt)
  const partsByNumber = new Map<string, (typeof unfilteredPending)[0]>();
  for (const part of unfilteredPending) {
    const existing = partsByNumber.get(part.partNumber);
    if (!existing || part.createdAt > existing.createdAt) {
      partsByNumber.set(part.partNumber, part);
    }
  }
  const pendingParts = Array.from(partsByNumber.values());

  const subsystems = await db.select().from(schema.subsystems).all();

  return c.json({
    parts: pendingParts,
    subsystems,
  });
});

router.post("/parts/:partNumber/fetch-drawing", requireAuth, async (c) => {
  const partNumber = c.req.param("partNumber");

  if (!partNumber) {
    return c.json({ error: "Missing partNumber" }, 400);
  }

  try {
    const db = createShopDb(c.env.SHOP_DB);

    // Get the OnShape part info
    const part = await db
      .select()
      .from(schema.onshapeParts)
      .where(eq(schema.onshapeParts.partNumber, partNumber))
      .get();

    if (!part) {
      return c.json({ error: "Part not found in OnShape data" }, 404);
    }

    if (!part.partDrawingEntityId || !part.versionId) {
      return c.json({ error: "Part drawing entity ID or version ID not available" }, 400);
    }

    // Get document ID from KV storage
    const configStr = await c.env.SESSIONS.get("onshape-config:document");
    const config = configStr ? (JSON.parse(configStr) as { documentId?: string }) : {};
    const documentId = config.documentId;

    if (!documentId) {
      return c.json({ error: "Document ID not configured" }, 400);
    }

    // Fetch the drawing
    const pdfBuffer = await exportDrawingAsPDF(
      documentId,
      part.versionId,
      part.partDrawingEntityId,
      c.env,
    );

    // Store in R2
    const r2Key = `drawings/${partNumber}.pdf`;
    await c.env.DRAWINGS.put(r2Key, pdfBuffer, {
      httpMetadata: {
        contentType: "application/pdf",
      },
    });

    return c.json({
      success: true,
      partNumber,
      message: "Drawing fetched and cached successfully",
    });
  } catch (err) {
    console.error("[Admin Parts] Drawing fetch error", err);
    return c.json(
      {
        error: err instanceof Error ? err.message : "Failed to fetch drawing",
      },
      500,
    );
  }
});

router.get("/onshape/config", requireAdmin, async (c) => {
  const configStr = await c.env.SESSIONS.get("onshape-config:document");
  const config = configStr
    ? (JSON.parse(configStr) as { documentId?: string; mainAssemblyId?: string })
    : {};

  return c.json({
    documentId: config.documentId || "",
    mainAssemblyId: config.mainAssemblyId || "",
  });
});

router.post("/onshape/config", requireAdmin, async (c) => {
  const body = await c.req.json<{ documentId?: string; mainAssemblyId?: string }>();

  if (!body.documentId || !body.documentId.trim()) {
    return c.json({ error: "documentId is required" }, 400);
  }

  const config = {
    documentId: body.documentId.trim(),
    mainAssemblyId: body.mainAssemblyId?.trim() || undefined,
  };

  await c.env.SESSIONS.put("onshape-config:document", JSON.stringify(config));

  return c.json({ success: true, config });
});

// Development only: seed test pending parts
router.get("/seed-test-parts", requireAuth, async (c) => {
  const db = createShopDb(c.env.SHOP_DB);

  // Clear existing onshapeParts
  await db.delete(schema.onshapeParts);

  const testParts = [
    {
      entityId: "4c962b683afb610b63d1a054",
      partDrawingEntityId: "51596d90191a55399895169d",
      onshapeReleaseId: "65f6368c45ffd946381a6638",
      releaseId: null,
      partNumber: "1648-26-P-0475",
      versionId: "78963be1e83bad7857f14f95",
      quantity: null,
    },
    {
      entityId: "afcc70bb4a69714fec574c78",
      partDrawingEntityId: null,
      onshapeReleaseId: "65f6368c45ffd946381a6638",
      releaseId: null,
      partNumber: "1648-26-P-0518",
      versionId: "78963be1e83bad7857f14f95",
      quantity: null,
    },
    {
      entityId: "4c962b683afb610b63d1a054",
      partDrawingEntityId: "51596d90191a55399895169d",
      onshapeReleaseId: "08bf1a10144fee2eb7a25b01",
      releaseId: null,
      partNumber: "1648-26-P-0475",
      versionId: "d612752ee89b974a66c8de06",
      quantity: null,
    },
    {
      entityId: "afcc70bb4a69714fec574c78",
      partDrawingEntityId: null,
      onshapeReleaseId: "08bf1a10144fee2eb7a25b01",
      releaseId: null,
      partNumber: "1648-26-P-0518",
      versionId: "d612752ee89b974a66c8de06",
      quantity: null,
    },
    {
      entityId: "4c962b683afb610b63d1a054",
      partDrawingEntityId: "51596d90191a55399895169d",
      onshapeReleaseId: "69e7a461bccdc595ecad5cc8",
      releaseId: null,
      partNumber: "1648-26-P-0475",
      versionId: "21887b33ecbae4838890a78b",
      quantity: null,
    },
    {
      entityId: "afcc70bb4a69714fec574c78",
      partDrawingEntityId: null,
      onshapeReleaseId: "69e7a461bccdc595ecad5cc8",
      releaseId: null,
      partNumber: "1648-26-P-0518",
      versionId: "21887b33ecbae4838890a78b",
      quantity: null,
    },
  ];

  for (const part of testParts) {
    await db.insert(schema.onshapeParts).values({ ...part, createdAt: Date.now() });
  }

  return c.json({ success: true, inserted: testParts.length });
});

export const adminPartsRouter = router;
