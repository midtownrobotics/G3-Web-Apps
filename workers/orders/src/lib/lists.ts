import { eq, inArray } from "drizzle-orm";
import type { OrdersDb } from "../db";
import { orderRequests, partListItems, partLists } from "../db/schema";

/**
 * Puts requests on a list (ones already there are left alone). Returns how many were new, or
 * null if any request doesn't exist.
 */
export async function addToList(
  db: OrdersDb,
  listId: number,
  requestIds: number[],
  addedByName: string,
): Promise<number | null> {
  const existing = await db
    .select({ id: orderRequests.id })
    .from(orderRequests)
    .where(inArray(orderRequests.id, requestIds))
    .all();
  if (existing.length !== requestIds.length) return null;
  const now = Date.now();
  const inserted = await db
    .insert(partListItems)
    .values(requestIds.map((requestId) => ({ listId, requestId, addedByName, addedAt: now })))
    .onConflictDoNothing()
    .returning()
    .all();
  await db.update(partLists).set({ updatedAt: now }).where(eq(partLists.id, listId));
  return inserted.length;
}
