/** The shop's timezone; billing cycles and daily charts use local days. */
export const TIME_ZONE = "America/New_York";

export const HOUR = 3600;
export const DAY = 86400;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** Local calendar parts for a unix timestamp (seconds). Month is 1-12. */
export function localParts(ts: number) {
  const parts: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(new Date(ts * 1000))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Local time minus UTC, in seconds, at the given instant. */
function offsetAt(ts: number) {
  const p = localParts(ts);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000;
  return asUtc - ts;
}

/** Unix timestamp of local midnight on the given date (month 1-12; overflow is normalized). */
export function localMidnight(year: number, month: number, day: number) {
  const guess = Date.UTC(year, month - 1, day) / 1000;
  // Re-check the offset at the candidate so DST transitions resolve correctly.
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first);
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "YYYY-MM-DD" for the local day containing ts. */
export function localDayKey(ts: number) {
  const p = localParts(ts);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * The billing cycle containing `now`. Cycles start at local midnight on
 * `startDay` of each month, clamped to the month's length (e.g. 31 → Feb 28).
 */
export function billingCycle(now: number, startDay: number) {
  const startOf = (year: number, month: number) => {
    const y = year + Math.floor((month - 1) / 12);
    const m = ((((month - 1) % 12) + 12) % 12) + 1;
    return localMidnight(y, m, Math.min(startDay, daysInMonth(y, m)));
  };
  const p = localParts(now);
  let start = startOf(p.year, p.month);
  let month = p.month;
  if (start > now) {
    month -= 1;
    start = startOf(p.year, month);
  }
  return { start, end: startOf(p.year, month + 1) };
}

/** Local day keys from start (inclusive) to end (exclusive). */
export function localDayKeys(start: number, end: number) {
  const keys: string[] = [];
  const p = localParts(start);
  for (let d = 0; ; d++) {
    const ts = localMidnight(p.year, p.month, p.day + d);
    if (ts >= end) break;
    keys.push(localDayKey(ts));
  }
  return keys;
}
