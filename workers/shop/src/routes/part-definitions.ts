import { eq, and } from "drizzle-orm";
import { Hono } from "hono";
import { createShopDb } from "../db";
import { partDefinitionProcessBlueprints, partDefinitions } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const partDefinitionsRouter = new Hono<AppEnv>()
  .get("/", requireAuth, async (c) => {
    const db = createShopDb(c.env.SHOP_DB);
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
    }>();

    const { onshapePartNumber, revision, subsystemId, name, notes, partDrawingUrl, processIds } = body;
    if (!onshapePartNumber || !revision || !subsystemId || !name) {
      return c.json({ error: "onshapePartNumber, revision, subsystemId, and name are required." }, 400);
    }

    const db = createShopDb(c.env.SHOP_DB);
    const now = Date.now();

    const partDef = await db
      .insert(partDefinitions)
      .values({ onshapePartNumber, revision, subsystemId, name, notes, partDrawingUrl, creator: c.get("userId"), createdAt: now })
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
  .post("/:id/processes", requireAuth, async (c) => {
    const partDefinitionId = Number(c.req.param("id"));
    const { index, processId } = await c.req.json<{ index: number; processId: number }>();

    if (index === undefined || !processId) {
      return c.json({ error: "index and processId are required." }, 400);
    }

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