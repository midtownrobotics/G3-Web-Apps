import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createEdgeDb } from "../db";
import { edgeStatus } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

/** The agent pushes every 5 minutes; after this long without contact it's shown as offline. */
const OFFLINE_AFTER_SECONDS = 15 * 60;

export const statusRouter = new Hono<AppEnv>().get("/", requireAuth, async (c) => {
  const db = createEdgeDb(c.env.EDGE_DB);
  const status = await db.select().from(edgeStatus).where(eq(edgeStatus.id, 1)).get();
  const now = Math.floor(Date.now() / 1000);
  return c.json({
    now,
    agent: status
      ? {
          version: status.agentVersion,
          startedAt: status.agentStartedAt,
          lastSeenAt: status.lastSeenAt,
          online: now - status.lastSeenAt < OFFLINE_AFTER_SECONDS,
        }
      : null,
  });
});
