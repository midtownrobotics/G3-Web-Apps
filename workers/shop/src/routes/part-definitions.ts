import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { createShopDb } from "../db";
import { partDefinitionProcessBlueprints, partDefinitions } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const updatePartValidator = validator(
  "json",
  (
    value,
  ): {
    onshapePartNumber?: string;
    revision?: string;
    subsystemId?: number;
    name?: string;
    notes?: string | null;
    partDrawingUrl?: string | null;
  } => {
    const v = (value ?? {}) as Record<string, unknown>;
    const out: {
      onshapePartNumber?: string;
      revision?: string;
      subsystemId?: number;
      name?: string;
      notes?: string | null;
      partDrawingUrl?: string | null;
    } = {};
    if (typeof v.onshapePartNumber === "string") out.onshapePartNumber = v.onshapePartNumber;
    if (typeof v.revision === "string") out.revision = v.revision;
    if (typeof v.subsystemId === "number") out.subsystemId = v.subsystemId;
    if (typeof v.name === "string") out.name = v.name;
    if (v.notes === null || typeof v.notes === "string") out.notes = v.notes;
    if (v.partDrawingUrl === null || typeof v.partDrawingUrl === "string")
      out.partDrawingUrl = v.partDrawingUrl;
    return out;
  },
);

const addBlueprintValidator = validator(
  "json",
  (value, c): { index: number; processId: number } => {
    const v = (value ?? {}) as { index?: unknown; processId?: unknown };
    if (!Number.isInteger(v.index) || (v.index as number) < 0)
      return c.json({ error: "index must be a non-negative integer." }, 400) as never;
    if (!Number.isInteger(v.processId) || (v.processId as number) < 1)
      return c.json({ error: "processId must be a positive integer." }, 400) as never;
    return { index: v.index as number, processId: v.processId as number };
  },
);

const reorderBlueprintValidator = validator("json", (value, c): { processIds: number[] } => {
  const v = (value ?? {}) as { processIds?: unknown };
  if (!Array.isArray(v.processIds) || v.processIds.some((p) => !Number.isInteger(p)))
    return c.json({ error: "processIds must be an array of integers." }, 400) as never;
  return { processIds: v.processIds as number[] };
});

export const partDefinitionsRouter = new Hono<AppEnv>()
  .get("/", requireAuth, async (c) => {
    const db = createShopDb(c.env.SHOP_DB);
    const onshapePartNumber = c.req.query("onshapePartNumber");

    if (onshapePartNumber) {
      const rows = await db
        .select({ revision: partDefinitions.revision })
        .from(partDefinitions)
        .where(eq(partDefinitions.onshapePartNumber, onshapePartNumber))
        .all();
      return c.json(rows);
    }

    const rows = await db.select().from(partDefinitions).all();
    return c.json(rows);
  })
  .post("/", requireAuth, async (c) => {
    const body = await c.req.json<{
      onshapePartNumber: string;
      revision: string;
      subsystemId: number;
      name: string;
      notes?: string;
      partDrawingUrl?: string;
      processIds?: number[];
      obsoleteExisting?: boolean;
    }>();

    const {
      onshapePartNumber,
      revision,
      subsystemId,
      name,
      notes,
      partDrawingUrl,
      processIds,
      obsoleteExisting,
    } = body;
    if (!onshapePartNumber || !revision || !subsystemId || !name) {
      return c.json(
        { error: "onshapePartNumber, revision, subsystemId, and name are required." },
        400,
      );
    }

    const db = createShopDb(c.env.SHOP_DB);
    const now = Date.now();

    // If obsoleteExisting is true, mark all existing parts with same number as obsolete
    if (obsoleteExisting) {
      try {
        await db
          .update(partDefinitions)
          .set({ isObsolete: 1 })
          .where(eq(partDefinitions.onshapePartNumber, onshapePartNumber));
      } catch (err) {
        console.error("[Part Definitions] Error marking obsolete parts", err);
        return c.json(
          { error: err instanceof Error ? err.message : "Failed to mark obsolete parts" },
          500,
        );
      }
    }

    const partDef = await db
      .insert(partDefinitions)
      .values({
        onshapePartNumber,
        revision,
        subsystemId,
        name,
        notes,
        partDrawingUrl,
        creator: c.get("userId"),
        createdAt: now,
      })
      .returning()
      .get();

    if (processIds && processIds.length > 0) {
      await db.insert(partDefinitionProcessBlueprints).values(
        processIds.map((processId, index) => ({
          partDefinitionId: partDef.id,
          processId,
          index,
          createdAt: now,
        })),
      );
    }

    return c.json(partDef, 201);
  })
  .patch("/:id", requireAuth, updatePartValidator, async (c) => {
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");

    const updates: Partial<{
      onshapePartNumber: string;
      revision: string;
      subsystemId: number;
      name: string;
      notes: string | null;
      partDrawingUrl: string | null;
    }> = {};

    // Required fields: if provided, must be non-empty.
    if (body.onshapePartNumber !== undefined) {
      if (!body.onshapePartNumber.trim())
        return c.json({ error: "onshapePartNumber cannot be empty." }, 400);
      updates.onshapePartNumber = body.onshapePartNumber.trim();
    }
    if (body.revision !== undefined) {
      if (!body.revision.trim()) return c.json({ error: "revision cannot be empty." }, 400);
      updates.revision = body.revision.trim();
    }
    if (body.name !== undefined) {
      if (!body.name.trim()) return c.json({ error: "name cannot be empty." }, 400);
      updates.name = body.name.trim();
    }
    if (body.subsystemId !== undefined) {
      if (!Number.isInteger(body.subsystemId) || body.subsystemId < 1)
        return c.json({ error: "subsystemId must be a positive integer." }, 400);
      updates.subsystemId = body.subsystemId;
    }
    // Nullable fields: may be set to a value or cleared with null.
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.partDrawingUrl !== undefined) updates.partDrawingUrl = body.partDrawingUrl;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No updatable fields provided." }, 400);
    }

    const db = createShopDb(c.env.SHOP_DB);
    const row = await db
      .update(partDefinitions)
      .set(updates)
      .where(eq(partDefinitions.id, id))
      .returning()
      .get();

    if (!row) return c.json({ error: "Part definition not found." }, 404);
    return c.json(row);
  })
  .get("/:id/processes", requireAuth, async (c) => {
    const partDefinitionId = Number(c.req.param("id"));
    const db = createShopDb(c.env.SHOP_DB);
    const rows = await db
      .select()
      .from(partDefinitionProcessBlueprints)
      .where(eq(partDefinitionProcessBlueprints.partDefinitionId, partDefinitionId))
      .orderBy(asc(partDefinitionProcessBlueprints.index))
      .all();
    return c.json(rows);
  })
  .patch("/:id/processes/reorder", requireAuth, reorderBlueprintValidator, async (c) => {
    const partDefinitionId = Number(c.req.param("id"));
    const { processIds } = c.req.valid("json");

    if (processIds.length === 0) {
      return c.json({ error: "processIds must be a non-empty array of integers." }, 400);
    }

    const db = createShopDb(c.env.SHOP_DB);
    const existing = await db
      .select()
      .from(partDefinitionProcessBlueprints)
      .where(eq(partDefinitionProcessBlueprints.partDefinitionId, partDefinitionId))
      .all();

    const existingIds = existing.map((b) => b.processId).sort((a, b) => a - b);
    const givenIds = [...processIds].sort((a, b) => a - b);
    if (
      existingIds.length !== givenIds.length ||
      !existingIds.every((pid, i) => pid === givenIds[i])
    ) {
      return c.json(
        { error: "processIds must contain every blueprint process exactly once." },
        400,
      );
    }

    // Rewrite the blueprint atomically. A delete + reinsert avoids tripping the
    // (partDefinitionId, index) unique constraint that in-place index swaps would.
    const now = Date.now();
    await db.batch([
      db
        .delete(partDefinitionProcessBlueprints)
        .where(eq(partDefinitionProcessBlueprints.partDefinitionId, partDefinitionId)),
      db.insert(partDefinitionProcessBlueprints).values(
        processIds.map((processId, index) => ({
          partDefinitionId,
          processId,
          index,
          createdAt: now,
        })),
      ),
    ]);

    const rows = await db
      .select()
      .from(partDefinitionProcessBlueprints)
      .where(eq(partDefinitionProcessBlueprints.partDefinitionId, partDefinitionId))
      .orderBy(asc(partDefinitionProcessBlueprints.index))
      .all();
    return c.json(rows);
  })
  .post("/:id/processes", requireAuth, addBlueprintValidator, async (c) => {
    const partDefinitionId = Number(c.req.param("id"));
    const { index, processId } = c.req.valid("json");

    const db = createShopDb(c.env.SHOP_DB);
    const row = await db
      .insert(partDefinitionProcessBlueprints)
      .values({ partDefinitionId, processId, index, createdAt: Date.now() })
      .returning()
      .get();

    return c.json(row, 201);
  })
  .delete("/:id/processes/:processId", requireAuth, async (c) => {
    const partDefinitionId = Number(c.req.param("id"));
    const processId = Number(c.req.param("processId"));

    const db = createShopDb(c.env.SHOP_DB);
    await db
      .delete(partDefinitionProcessBlueprints)
      .where(
        and(
          eq(partDefinitionProcessBlueprints.partDefinitionId, partDefinitionId),
          eq(partDefinitionProcessBlueprints.processId, processId),
        ),
      );

    return c.json({ ok: true });
  });
