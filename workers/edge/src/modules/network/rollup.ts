import { DAY, HOUR } from "../../lib/time";

/** Raw 5-minute rows are kept this long before being rolled up into hourly rows. */
export const RAW_RETENTION_SECONDS = 14 * DAY;

/**
 * Moves raw rows older than the retention window into net_usage_hourly, in one
 * atomic batch. The cutoff is hour-aligned so no hour is split across tables.
 */
export async function rollupUsage(d1: D1Database, now = Math.floor(Date.now() / 1000)) {
  const cutoff = Math.floor((now - RAW_RETENTION_SECONDS) / HOUR) * HOUR;
  const [inserted] = await d1.batch([
    d1
      .prepare(
        `INSERT INTO net_usage_hourly (mac, ts, dl_bytes, ul_bytes)
         SELECT mac, (ts / ${HOUR}) * ${HOUR}, SUM(dl_bytes), SUM(ul_bytes)
         FROM net_usage WHERE ts < ?1 GROUP BY mac, ts / ${HOUR}
         ON CONFLICT (ts, mac) DO UPDATE SET
           dl_bytes = dl_bytes + excluded.dl_bytes,
           ul_bytes = ul_bytes + excluded.ul_bytes`,
      )
      .bind(cutoff),
    d1.prepare("DELETE FROM net_usage WHERE ts < ?1").bind(cutoff),
  ]);
  console.log("[Rollup] Rolled up usage", { cutoff, hourlyRows: inserted?.meta.changes });
}
