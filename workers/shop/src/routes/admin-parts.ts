import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createShopDb } from "../db";
import * as schema from "../db/schema";
import { exportDrawingAsPDF } from "../lib/onshape-export";
import { registerOnShapeWebhook, unregisterOnShapeWebhooks } from "../lib/onshape-webhook";
import { requireAdmin, requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const adminPartsRouter = new Hono<AppEnv>()
  .get("/parts/pending", requireAuth, async (c) => {
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
  })
  .post("/parts/:partNumber/:revision/fetch-drawing", requireAuth, async (c) => {
    const partNumber = c.req.param("partNumber");
    const revision = c.req.param("revision");

    if (!partNumber || !revision) {
      return c.json({ error: "Missing partNumber or revision" }, 400);
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
        return c.json(
          {
            error: "Part not found in OnShape data",
            detail: `No part found with number "${partNumber}"`,
          },
          404,
        );
      }

      if (!part.partDrawingEntityId) {
        return c.json(
          {
            error: "Part has no drawing available",
            detail: "This part exists but has no drawing in OnShape",
          },
          400,
        );
      }

      if (!part.versionId) {
        return c.json(
          {
            error: "Part version not available",
            detail: "Drawing metadata is missing the version ID",
          },
          400,
        );
      }

      // Get document ID from database
      const docIdSetting = await db
        .select()
        .from(schema.adminSettings)
        .where(eq(schema.adminSettings.key, "onshape_document_id"))
        .get();
      const documentId = docIdSetting?.value;

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

      // Store in R2 with revision in path
      const r2Key = `drawings/${partNumber}/${revision}/drawing.pdf`;
      await c.env.DRAWINGS.put(r2Key, pdfBuffer, {
        httpMetadata: {
          contentType: "application/pdf",
        },
      });

      return c.json({
        success: true,
        partNumber,
        revision,
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
  })
  .delete("/parts/:partNumber", requireAuth, async (c) => {
    const partNumber = c.req.param("partNumber");

    if (!partNumber) {
      return c.json({ error: "Missing partNumber" }, 400);
    }

    try {
      const db = createShopDb(c.env.SHOP_DB);

      // Delete all onshapeParts with this part number
      await db.delete(schema.onshapeParts).where(eq(schema.onshapeParts.partNumber, partNumber));

      return c.json({
        success: true,
        partNumber,
        message: "Part deleted successfully",
      });
    } catch (err) {
      console.error("[Admin Parts] Delete error", err);
      return c.json(
        {
          error: err instanceof Error ? err.message : "Failed to delete part",
        },
        500,
      );
    }
  })
  .get("/onshape/config", requireAdmin, async (c) => {
    const db = createShopDb(c.env.SHOP_DB);

    const [docIdSetting, mainAssemblyIdSetting] = await Promise.all([
      db
        .select()
        .from(schema.adminSettings)
        .where(eq(schema.adminSettings.key, "onshape_document_id"))
        .get(),
      db
        .select()
        .from(schema.adminSettings)
        .where(eq(schema.adminSettings.key, "onshape_main_assembly_id"))
        .get(),
    ]);

    return c.json({
      documentId: docIdSetting?.value || "",
      mainAssemblyId: mainAssemblyIdSetting?.value || "",
    });
  })
  .post("/onshape/config", requireAdmin, async (c) => {
    const body = await c.req.json<{ documentId?: string; mainAssemblyId?: string }>();

    if (!body.documentId || !body.documentId.trim()) {
      return c.json({ error: "documentId is required" }, 400);
    }

    const db = createShopDb(c.env.SHOP_DB);
    const now = Math.floor(Date.now() / 1000);

    try {
      // Get old document ID for webhook cleanup
      const existingDocId = await db
        .select()
        .from(schema.adminSettings)
        .where(eq(schema.adminSettings.key, "onshape_document_id"))
        .get();

      const oldDocId = existingDocId?.value;

      // Update or insert documentId
      if (existingDocId) {
        await db
          .update(schema.adminSettings)
          .set({
            value: body.documentId.trim(),
            updatedAt: now,
          })
          .where(eq(schema.adminSettings.key, "onshape_document_id"));
      } else {
        await db.insert(schema.adminSettings).values({
          key: "onshape_document_id",
          value: body.documentId.trim(),
          updatedAt: now,
        });
      }

      // Update or insert mainAssemblyId if provided
      if (body.mainAssemblyId?.trim()) {
        const existingMainAssemblyId = await db
          .select()
          .from(schema.adminSettings)
          .where(eq(schema.adminSettings.key, "onshape_main_assembly_id"))
          .get();

        if (existingMainAssemblyId) {
          await db
            .update(schema.adminSettings)
            .set({
              value: body.mainAssemblyId.trim(),
              updatedAt: now,
            })
            .where(eq(schema.adminSettings.key, "onshape_main_assembly_id"));
        } else {
          await db.insert(schema.adminSettings).values({
            key: "onshape_main_assembly_id",
            value: body.mainAssemblyId.trim(),
            updatedAt: now,
          });
        }
      }

      // Unregister old webhook and register new one
      if (oldDocId && oldDocId !== body.documentId.trim()) {
        console.log("[OnShape Config] Document ID changed, updating webhook registration");
        await unregisterOnShapeWebhooks(oldDocId, c.env);
      }

      try {
        await registerOnShapeWebhook(body.documentId.trim(), c.env);
      } catch (err) {
        console.error("[OnShape Config] Webhook registration failed", err);
        // Don't fail the config update if webhook registration fails
      }

      return c.json({
        success: true,
        config: {
          documentId: body.documentId.trim(),
          mainAssemblyId: body.mainAssemblyId?.trim() || undefined,
        },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Failed to update config" }, 500);
    }
  })
  .get("/seed-test-parts", requireAuth, async (c) => {
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
        quantity: 2,
        revision: "A",
        name: "Main Shaft Assembly",
        description: "Primary drive shaft for the drivetrain",
      },
      {
        entityId: "afcc70bb4a69714fec574c78",
        partDrawingEntityId: null,
        onshapeReleaseId: "65f6368c45ffd946381a6638",
        releaseId: null,
        partNumber: "1648-26-P-0518",
        versionId: "78963be1e83bad7857f14f95",
        quantity: 4,
        revision: "B",
        name: "Bearing Mount Plate",
        description: "Mounts bearings to the frame",
      },
      {
        entityId: "4c962b683afb610b63d1a054",
        partDrawingEntityId: "51596d90191a55399895169d",
        onshapeReleaseId: "08bf1a10144fee2eb7a25b01",
        releaseId: null,
        partNumber: "1648-26-P-0475",
        versionId: "d612752ee89b974a66c8de06",
        quantity: 2,
        revision: "C",
        name: "Main Shaft Assembly",
        description: "Updated drive shaft with improved tolerances",
      },
      {
        entityId: "afcc70bb4a69714fec574c78",
        partDrawingEntityId: null,
        onshapeReleaseId: "08bf1a10144fee2eb7a25b01",
        releaseId: null,
        partNumber: "1648-26-P-0518",
        versionId: "d612752ee89b974a66c8de06",
        quantity: 4,
        revision: "A",
        name: "Bearing Mount Plate",
        description: "Updated mounting plate design",
      },
      {
        entityId: "4c962b683afb610b63d1a054",
        partDrawingEntityId: "51596d90191a55399895169d",
        onshapeReleaseId: "69e7a461bccdc595ecad5cc8",
        releaseId: null,
        partNumber: "1648-26-P-0475",
        versionId: "21887b33ecbae4838890a78b",
        quantity: 2,
        revision: "D",
        name: "Main Shaft Assembly",
        description: "Final production revision",
      },
      {
        entityId: "afcc70bb4a69714fec574c78",
        partDrawingEntityId: null,
        onshapeReleaseId: "69e7a461bccdc595ecad5cc8",
        releaseId: null,
        partNumber: "1648-26-P-0518",
        versionId: "21887b33ecbae4838890a78b",
        quantity: 4,
        revision: "B",
        name: "Bearing Mount Plate",
        description: "Final production version",
      },
    ];

    for (const part of testParts) {
      await db.insert(schema.onshapeParts).values({ ...part, createdAt: Date.now() });
    }

    return c.json({ success: true, inserted: testParts.length });
  })
  .get("/slack/config", requireAdmin, async (c) => {
    const db = createShopDb(c.env.SHOP_DB);
    const setting = await db
      .select()
      .from(schema.adminSettings)
      .where(eq(schema.adminSettings.key, "slack_release_channel_id"))
      .get();

    return c.json({
      slackReleaseChannelId: setting?.value || "",
    });
  })
  .post("/slack/config", requireAdmin, async (c) => {
    const db = createShopDb(c.env.SHOP_DB);
    const body = await c.req.json<{ slackReleaseChannelId: string }>();

    if (!body.slackReleaseChannelId?.trim()) {
      return c.json({ error: "Slack channel ID is required" }, 400);
    }

    try {
      const existing = await db
        .select()
        .from(schema.adminSettings)
        .where(eq(schema.adminSettings.key, "slack_release_channel_id"))
        .get();

      if (existing) {
        await db
          .update(schema.adminSettings)
          .set({
            value: body.slackReleaseChannelId.trim(),
            updatedAt: Math.floor(Date.now() / 1000),
          })
          .where(eq(schema.adminSettings.key, "slack_release_channel_id"));
      } else {
        await db.insert(schema.adminSettings).values({
          key: "slack_release_channel_id",
          value: body.slackReleaseChannelId.trim(),
          updatedAt: Math.floor(Date.now() / 1000),
        });
      }

      return c.json({ slackReleaseChannelId: body.slackReleaseChannelId.trim() });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Failed to update setting" },
        500,
      );
    }
  });
