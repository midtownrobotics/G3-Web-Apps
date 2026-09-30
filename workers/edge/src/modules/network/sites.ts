import type { EdgeDb } from "../../db";
import { DAY, HOUR, localDayKey, localDayKeys } from "../../lib/time";

export const MAX_SITE_ROWS_PER_BATCH = 5000;

/** Hourly rows are kept this long before being rolled up into daily rows. */
export const HOURLY_RETENTION_SECONDS = 30 * DAY;
/** Daily rows are deleted after this long. */
export const DAILY_RETENTION_SECONDS = 365 * DAY;
/** Daily rollup buckets use US Eastern standard time (UTC-5) all year. */
const DAY_OFFSET = 5 * HOUR;

/** One client's usage of one site in one hour: [hourStartTs, mac, site, dlBytes, ulBytes]. */
export type SiteRow = [ts: number, mac: string, site: string, dl: number, ul: number];

const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;

export function parseSiteBatch(value: unknown): { rows: SiteRow[] } | null {
  if (typeof value !== "object" || value === null) return null;
  const { rows } = value as Record<string, unknown>;
  if (!Array.isArray(rows) || rows.length > MAX_SITE_ROWS_PER_BATCH) return null;
  for (const r of rows) {
    if (!Array.isArray(r) || r.length !== 5) return null;
    const [ts, mac, site, dl, ul] = r;
    if (!isCount(ts) || ts % HOUR !== 0) return null;
    if (!isText(mac, 64) || !isText(site, 253) || !isCount(dl) || !isCount(ul)) return null;
  }
  return { rows: rows as SiteRow[] };
}

/**
 * Stores finished hours. Each (hour, client) in the batch replaces what was
 * there, since a re-sent hour can group sites into "(other)" differently.
 */
export async function ingestSites(d1: D1Database, rows: SiteRow[]) {
  const statements: D1PreparedStatement[] = [];
  const cleared = new Set<string>();
  for (const [ts, mac] of rows) {
    const key = `${ts}|${mac}`;
    if (cleared.has(key)) continue;
    cleared.add(key);
    statements.push(
      d1.prepare("DELETE FROM net_site_usage WHERE ts = ? AND mac = ?").bind(ts, mac),
    );
  }
  // D1 allows 100 bound parameters per statement: 5 per row.
  for (let i = 0; i < rows.length; i += 20) {
    const chunk = rows.slice(i, i + 20);
    statements.push(
      d1
        .prepare(
          `INSERT OR REPLACE INTO net_site_usage (ts, mac, site, dl_bytes, ul_bytes) VALUES ${chunk
            .map(() => "(?, ?, ?, ?, ?)")
            .join(", ")}`,
        )
        .bind(...chunk.flat()),
    );
  }
  if (statements.length > 0) await d1.batch(statements);
  return { stored: rows.length };
}

// Hourly rows plus daily rollups; the rollup deletes the hourly rows it moves.
const ALL_SITE_USAGE = `(
  SELECT mac, ts, site, dl_bytes, ul_bytes FROM net_site_usage
  UNION ALL
  SELECT mac, ts, site, dl_bytes, ul_bytes FROM net_site_usage_daily
)`;

interface Totals {
  dl: number;
  ul: number;
}

/** Top sites across all clients, with how many devices used each. */
export async function topSites(db: EdgeDb, from: number, to: number, limit = 100) {
  const { results } = await db.$client
    .prepare(
      `SELECT site, SUM(dl_bytes) AS dl, SUM(ul_bytes) AS ul, COUNT(DISTINCT mac) AS devices
       FROM ${ALL_SITE_USAGE} WHERE ts >= ?1 AND ts < ?2
       GROUP BY site ORDER BY SUM(dl_bytes + ul_bytes) DESC LIMIT ?3`,
    )
    .bind(from, to, limit)
    .all<{ site: string; devices: number } & Totals>();
  return results;
}

/** Per-client totals for one site. */
export async function siteClients(db: EdgeDb, site: string, from: number, to: number) {
  const { results } = await db.$client
    .prepare(
      `SELECT mac, SUM(dl_bytes) AS dl, SUM(ul_bytes) AS ul
       FROM ${ALL_SITE_USAGE} WHERE site = ?1 AND ts >= ?2 AND ts < ?3
       GROUP BY mac ORDER BY SUM(dl_bytes + ul_bytes) DESC`,
    )
    .bind(site, from, to)
    .all<{ mac: string } & Totals>();
  return results;
}

/** Top sites for one client. */
export async function clientSites(db: EdgeDb, mac: string, from: number, to: number, limit = 50) {
  const { results } = await db.$client
    .prepare(
      `SELECT site, SUM(dl_bytes) AS dl, SUM(ul_bytes) AS ul
       FROM ${ALL_SITE_USAGE} WHERE mac = ?1 AND ts >= ?2 AND ts < ?3
       GROUP BY site ORDER BY SUM(dl_bytes + ul_bytes) DESC LIMIT ?4`,
    )
    .bind(mac, from, to, limit)
    .all<{ site: string } & Totals>();
  return results;
}

/** Per-local-day totals for one site, with a zero entry for every day in range. */
export async function siteDaily(db: EdgeDb, site: string, from: number, to: number) {
  const { results } = await db.$client
    .prepare(
      `SELECT ts, SUM(dl_bytes) AS dl, SUM(ul_bytes) AS ul FROM ${ALL_SITE_USAGE}
       WHERE site = ?1 AND ts >= ?2 AND ts < ?3 GROUP BY ts`,
    )
    .bind(site, from, to)
    .all<{ ts: number } & Totals>();
  const days = new Map(localDayKeys(from, to).map((day) => [day, { dl: 0, ul: 0 }]));
  for (const r of results) {
    const d = days.get(localDayKey(r.ts));
    if (!d) continue;
    d.dl += r.dl;
    d.ul += r.ul;
  }
  return [...days].map(([day, t]) => ({ day, ...t }));
}

/**
 * Moves hourly rows older than 30 days into daily rows and deletes daily rows
 * older than a year, in one atomic batch.
 */
export async function rollupSites(d1: D1Database, now = Math.floor(Date.now() / 1000)) {
  const cutoff = Math.floor((now - HOURLY_RETENTION_SECONDS) / HOUR) * HOUR;
  const day = `((ts - ${DAY_OFFSET}) / ${DAY}) * ${DAY} + ${DAY_OFFSET}`;
  const [inserted] = await d1.batch([
    d1
      .prepare(
        `INSERT INTO net_site_usage_daily (mac, ts, site, dl_bytes, ul_bytes)
         SELECT mac, ${day}, site, SUM(dl_bytes), SUM(ul_bytes)
         FROM net_site_usage WHERE ts < ?1 GROUP BY mac, ${day}, site
         ON CONFLICT (ts, mac, site) DO UPDATE SET
           dl_bytes = dl_bytes + excluded.dl_bytes,
           ul_bytes = ul_bytes + excluded.ul_bytes`,
      )
      .bind(cutoff),
    d1.prepare("DELETE FROM net_site_usage WHERE ts < ?1").bind(cutoff),
    d1
      .prepare("DELETE FROM net_site_usage_daily WHERE ts < ?1")
      .bind(now - DAILY_RETENTION_SECONDS),
  ]);
  console.log("[Rollup] Rolled up site usage", { cutoff, dailyRows: inserted?.meta.changes });
}
