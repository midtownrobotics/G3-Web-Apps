import { eq } from "drizzle-orm";
import type { EdgeDb } from "../../db";
import { netSettings } from "../../db/schema";

export async function getSettings(db: EdgeDb) {
  const settings = await db.select().from(netSettings).where(eq(netSettings.id, 1)).get();
  if (!settings) throw new Error("net_settings row missing");
  return settings;
}

export const clientName = (c: {
  mac: string;
  displayName: string | null;
  hostname: string | null;
}) => c.displayName ?? c.hostname ?? c.mac;
