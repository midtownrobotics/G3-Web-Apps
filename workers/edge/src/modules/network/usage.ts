import type { EdgeDb } from "../../db";
import { DAY, HOUR, localDayKey, localDayKeys } from "../../lib/time";

// Raw 5-minute rows plus rolled-up hourly rows. The rollup deletes raw rows as it
// moves them, so the two never overlap.
const ALL_USAGE = `(
  SELECT mac, ts, dl_bytes, ul_bytes FROM net_usage
  UNION ALL
  SELECT mac, ts, dl_bytes, ul_bytes FROM net_usage_hourly
)`;

export interface Totals {
  dl: number;
  ul: number;
}

export async function totalsByMac(db: EdgeDb, from: number, to: number) {
  const { results } = await db.$client
    .prepare(
      `SELECT mac, SUM(dl_bytes) AS dl, SUM(ul_bytes) AS ul FROM ${ALL_USAGE}
       WHERE ts >= ?1 AND ts < ?2 GROUP BY mac`,
    )
    .bind(from, to)
    .all<{ mac: string } & Totals>();
  return new Map(results.map((r) => [r.mac, { dl: r.dl, ul: r.ul }]));
}

export async function hourlyFor(db: EdgeDb, mac: string, from: number, to: number) {
  const { results } = await db.$client
    .prepare(
      `SELECT (ts / ${HOUR}) * ${HOUR} AS hour, SUM(dl_bytes) AS dl, SUM(ul_bytes) AS ul
       FROM ${ALL_USAGE} WHERE mac = ?1 AND ts >= ?2 AND ts < ?3 GROUP BY hour ORDER BY hour`,
    )
    .bind(mac, from, to)
    .all<{ hour: number } & Totals>();
  return results;
}

/** Per-local-day totals for one client, with a zero entry for every day in range. */
export async function dailyFor(db: EdgeDb, mac: string, from: number, to: number) {
  // Hour buckets align with local days because the shop's UTC offset is whole hours.
  const hours = await hourlyFor(db, mac, from, to);
  const days = new Map(localDayKeys(from, to).map((day) => [day, { dl: 0, ul: 0 }]));
  for (const h of hours) {
    const d = days.get(localDayKey(h.hour));
    if (!d) continue;
    d.dl += h.dl;
    d.ul += h.ul;
  }
  return [...days].map(([day, t]) => ({ day, ...t }));
}

export async function earliestSample(db: EdgeDb, mac: string) {
  const row = await db.$client
    .prepare(`SELECT MIN(ts) AS ts FROM ${ALL_USAGE} WHERE mac = ?1`)
    .bind(mac)
    .first<{ ts: number | null }>();
  return row?.ts ?? null;
}

/**
 * Month-end projections. `runRate` extrapolates the whole cycle so far;
 * `sevenDayPace` adds the last 7 days' average rate to what's already used.
 * Both are null until there's at least 6 hours of data to go on.
 */
export function project(args: {
  used: number;
  now: number;
  cycleStart: number;
  cycleEnd: number;
  recentBytes: number;
  recentSeconds: number;
}) {
  const { used, now, cycleStart, cycleEnd, recentBytes, recentSeconds } = args;
  const elapsed = now - cycleStart;
  const remaining = Math.max(0, cycleEnd - now);
  const minimum = 6 * HOUR;
  return {
    runRate: elapsed >= minimum ? Math.round((used / elapsed) * (cycleEnd - cycleStart)) : null,
    sevenDayPace:
      recentSeconds >= minimum
        ? Math.round(used + (recentBytes / recentSeconds) * remaining)
        : null,
  };
}

export const SEVEN_DAYS = 7 * DAY;
