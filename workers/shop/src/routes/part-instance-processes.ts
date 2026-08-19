import { and, asc, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { createShopDb } from "../db";
import { partInstanceProcesses } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";
import { recordAction } from "./actions";

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

    // Promote the next process in the pipeline so it becomes actionable.
    const next = await db
      .select()
      .from(partInstanceProcesses)
      .where(
        and(
          eq(partInstanceProcesses.partInstanceId, partInstanceId),
          gt(partInstanceProcesses.index, row.index),
        ),
      )
      .orderBy(asc(partInstanceProcesses.index))
      .limit(1)
      .get();

    if (next && next.status === "waiting") {
      await db
        .update(partInstanceProcesses)
        .set({ status: "todo" })
        .where(eq(partInstanceProcesses.id, next.id));
    }

    await recordAction(db, {
      userId: c.get("userId"),
      partInstanceId,
      processId,
      action: "completed",
    });

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

    await recordAction(db, {
      userId: c.get("userId"),
      partInstanceId,
      processId,
      action: "started",
    });

    return c.json(row);
  })
  .patch("/:partInstanceId/processes/:processId", requireAuth, async (c) => {
    const body = await c.req.json<{ status: string }>();
    const partInstanceId = Number(c.req.param("partInstanceId"));
    const processId = Number(c.req.param("processId"));

    const status = body.status as "todo" | "doing" | "done";
    if (!["todo", "doing", "done"].includes(status)) {
      return c.json({ error: "status must be 'todo', 'doing', or 'done'" }, 400);
    }

    const db = createShopDb(c.env.SHOP_DB);
    const row = await db
      .update(partInstanceProcesses)
      .set({
        status,
        completedAt: status === "done" ? Date.now() : null,
      })
      .where(
        and(
          eq(partInstanceProcesses.partInstanceId, partInstanceId),
          eq(partInstanceProcesses.processId, processId),
        ),
      )
      .returning()
      .get();

    if (!row) return c.json({ error: "Part instance process not found." }, 404);

    // When reverting from "done" to an earlier state, reset the next process back to "waiting"
    if (status !== "done") {
      const next = await db
        .select()
        .from(partInstanceProcesses)
        .where(
          and(
            eq(partInstanceProcesses.partInstanceId, partInstanceId),
            gt(partInstanceProcesses.index, row.index),
          ),
        )
        .orderBy(asc(partInstanceProcesses.index))
        .limit(1)
        .get();

      if (next && next.status === "todo") {
        await db
          .update(partInstanceProcesses)
          .set({ status: "waiting" })
          .where(eq(partInstanceProcesses.id, next.id));
      }
    }

    const actionMap: Record<string, string> = {
      todo: "reverted",
      doing: "resumed",
      done: "marked-done",
    };

    await recordAction(db, {
      userId: c.get("userId"),
      partInstanceId,
      processId,
      action: actionMap[status] ?? "updated",
    });

    return c.json(row);
  });
