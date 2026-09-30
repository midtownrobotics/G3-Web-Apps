import { desc, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createShopDb } from "../db";
import { type ActionType, actions } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const actionsRouter = new Hono<AppEnv>().get("/", requireAuth, async (c) => {
  const db = createShopDb(c.env.SHOP_DB);
  const rows = await db.select().from(actions).orderBy(desc(actions.createdAt)).all();
  return c.json(rows);
});

// D1 caps a statement at 100 bound parameters; each chunk adds 4 more for the fixed values.
const RECORD_CHUNK = 90;

/**
 * Record the same action for many part instances at one process, snapshotting part and process
 * names into each row (the log has no foreign keys and outlives deleted parts). Never throws —
 * logging must not block the underlying status change.
 */
export async function recordActions(
  db: ReturnType<typeof createShopDb>,
  entry: {
    userId: string;
    partInstanceIds: number[];
    processId: number;
    action: ActionType;
    at?: number;
  },
): Promise<void> {
  const at = entry.at ?? Date.now();
  try {
    for (let i = 0; i < entry.partInstanceIds.length; i += RECORD_CHUNK) {
      const ids = entry.partInstanceIds.slice(i, i + RECORD_CHUNK);
      await db.run(sql`
        INSERT INTO actions
          (user_id, part_instance_id, process_id, action, created_at,
           part_definition_id, part_number, part_name, instance_number, process_name)
        SELECT ${entry.userId}, pi.id, p.id, ${entry.action}, ${at},
               pi.part_definition_id, pd.onshape_part_number, pd.name, pi.instance_number, p.name
        FROM part_instances pi
        JOIN part_definitions pd ON pd.id = pi.part_definition_id
        JOIN processes p ON p.id = ${entry.processId}
        WHERE pi.id IN (${sql.join(ids, sql`, `)})
      `);
    }
  } catch (err) {
    console.error("Failed to record actions:", err);
  }
}

/** Record one part-process action; see recordActions. */
export async function recordAction(
  db: ReturnType<typeof createShopDb>,
  entry: { userId: string; partInstanceId: number; processId: number; action: ActionType },
): Promise<void> {
  const { partInstanceId, ...rest } = entry;
  await recordActions(db, { ...rest, partInstanceIds: [partInstanceId] });
}
