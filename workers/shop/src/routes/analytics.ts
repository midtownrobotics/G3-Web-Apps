import { Hono } from "hono";
import { validator } from "hono/validator";
import { createShopDb } from "../db";
import { loadAnalyticsInput } from "../lib/analytics/load";
import { computeReport } from "../lib/analytics/metrics";
import { buildModel } from "../lib/analytics/model";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const WINDOWS = { "14": 14, "30": 30, "90": 90, all: null } as const;
type WindowParam = keyof typeof WINDOWS;

const queryValidator = validator("query", (value, c): { days?: WindowParam; tz?: string } => {
  const days = value.days;
  if (days !== undefined && !(typeof days === "string" && days in WINDOWS)) {
    return c.json({ error: "days must be 14, 30, 90 or all." }, 400) as never;
  }
  const tz = value.tz;
  if (tz !== undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: String(tz) });
    } catch {
      return c.json({ error: "Unknown time zone." }, 400) as never;
    }
  }
  return { days: days as WindowParam | undefined, tz: tz as string | undefined };
});

export const analyticsRouter = new Hono<AppEnv>()
  /**
   * The analytics report over the last `days` (14, 30, 90 or "all"), in the viewer's time zone
   * (`tz`, for weekday/hour grouping and labels). Per-person numbers are admin-only, and never
   * sent to kiosk sessions.
   */
  .get("/", requireAuth, queryValidator, async (c) => {
    const query = c.req.valid("query");
    const days = WINDOWS[query.days ?? "30"];
    const timeZone = query.tz ?? "America/New_York";

    const now = Date.now();
    const model = buildModel(await loadAnalyticsInput(createShopDb(c.env.SHOP_DB)), now);
    const from =
      days === null
        ? Math.min(now, ...model.events.map((e) => e.createdAt))
        : now - days * 86_400_000;
    const report = computeReport(model, {
      from,
      to: now,
      days,
      timeZone,
      includePeople: c.get("userIsAdmin") && c.get("sessionType") !== "pin",
    });
    return c.json(report);
  });
