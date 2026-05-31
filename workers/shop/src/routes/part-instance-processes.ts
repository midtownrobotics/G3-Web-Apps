import { eq, and } from "drizzle-orm";
import { Hono } from "hono";
import { createShopDb } from "../db";
import { partInstanceProcesses } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const partInstanceProcessesRouter = new Hono<AppEnv>()
  .get("/", requireAuth, async (c) => {
    const processId = c.req.query("processId");
    const partInstanceId = c.req.query("partInstanceId");
    const db = createShopDb(c.env.SHOP_DB);

    if (processId) {
      const rows = await db
        .select()
        .from(partInstanceProcesses)
        .where(eq(partInstanceProcesses.processId, Number(processId)))
        .all();
      return c.json(rows);
    }

    if (partInstanceId) {
      const rows = await db
        .select()
        .from(partInstanceProcesses)
        .where(eq(partInstanceProcesses.partInstanceId, Number(partInstanceId)))
        .all();
      return c.json(rows);
    }

    return c.json({ error: "processId or partInstanceId query param is required." }, 400);
  })
  .post("/:partInstanceId/processes/:processId/done", requireAuth, async (c) => {
    const partInstanceId = Number(c.req.param("partInstanceId"));
    const processId = Number(c.req.param("processId"));

    const db = createShopDb(c.env.SHOP_DB);
    const row = await db
      .update(partInstanceProcesses)
      .set({ status: "done", completedAt: Date.now() })
      .where(
        and(
          eq(partInstanceProcesses.partInstanceId, partInstanceId),
          eq(partInstanceProcesses.processId, processId),
        ),
      )
      .returning()
      .get();

    if (!row) return c.json({ error: "Part instance process not found." }, 404);
    return c.json(row);
  })
  .post("/:partInstanceId/processes/:processId/doing", requireAuth, async (c) => {
    const partInstanceId = Number(c.req.param("partInstanceId"));
    const processId = Number(c.req.param("processId"));

    const db = createShopDb(c.env.SHOP_DB);
    const row = await db
      .update(partInstanceProcesses)
      .set({ status: "doing" })
      .where(
        and(
          eq(partInstanceProcesses.partInstanceId, partInstanceId),
          eq(partInstanceProcesses.processId, processId),
        ),
      )
      .returning()
      .get();

    if (!row) return c.json({ error: "Part instance process not found." }, 404);
    return c.json(row);
  });