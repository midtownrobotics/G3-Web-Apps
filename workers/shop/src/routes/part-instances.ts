import { eq, and, max } from "drizzle-orm";
import { Hono } from "hono";
import { createShopDb } from "../db";
import { partInstances } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const partInstancesRouter = new Hono<AppEnv>()
  .get("/", requireAuth, async (c) => {
    const partDefinitionId = c.req.query("partDefinitionId");
    const db = createShopDb(c.env.SHOP_DB);

    if (partDefinitionId) {
      const rows = await db
        .select()
        .from(partInstances)
        .where(eq(partInstances.partDefinitionId, Number(partDefinitionId)))
        .all();
      return c.json(rows);
    }

    const rows = await db.select().from(partInstances).all();
    return c.json(rows);
  })
  .post("/", requireAuth, async (c) => {
    const { partDefinitionId, quantity } = await c.req.json<{
      partDefinitionId: number;
      quantity: number;
    }>();

    if (!partDefinitionId || !quantity || quantity < 1) {
      return c.json({ error: "partDefinitionId and quantity (>= 1) are required." }, 400);
    }

    const db = createShopDb(c.env.SHOP_DB);
    const now = Date.now();

    const result = await db
      .select({ maxInstance: max(partInstances.instanceNumber) })
      .from(partInstances)
      .where(eq(partInstances.partDefinitionId, partDefinitionId))
      .get();

    const nextNumber = (result?.maxInstance ?? 0) + 1;

    const rows = await db
      .insert(partInstances)
      .values(
        Array.from({ length: quantity }, (_, i) => ({
          partDefinitionId,
          instanceNumber: nextNumber + i,
          createdAt: now,
        })),
      )
      .returning()
      .all();

    return c.json(rows, 201);
  })
  .patch("/:id", requireAuth, async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json<{ isPriority?: boolean; isStale?: boolean }>();

    const updates: Partial<{ isPriority: number; isStale: number }> = {};
    if (body.isPriority !== undefined) updates.isPriority = body.isPriority ? 1 : 0;
    if (body.isStale !== undefined) updates.isStale = body.isStale ? 1 : 0;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No updatable fields provided." }, 400);
    }

    const db = createShopDb(c.env.SHOP_DB);
    const row = await db
      .update(partInstances)
      .set(updates)
      .where(eq(partInstances.id, id))
      .returning()
      .get();

    if (!row) return c.json({ error: "Part instance not found." }, 404);
    return c.json(row);
  });