import { type Insight, findInsights } from "./insights";
import type { Model, StepRun } from "./model";

// The analytics report: plain JSON for the analytics page and the Slack messages.

/** Percentile norms need at least this many samples to mean anything. */
export const MIN_SAMPLES = 8;
/** "Stuck" threshold when there's too little history for a percentile: sessions waited. */
const DEFAULT_WAIT_NORM = 2;

export type Dist = { n: number; p50: number; p85: number; p95: number };

export type SessionPoint = {
  start: number;
  end: number;
  label: string;
  completed: number;
  started: number;
  people: number;
  live: boolean;
};

export type ProcessStats = {
  id: number;
  name: string;
  /** Steps finished in the window. */
  completed: number;
  /** Shop minutes from start to done, all history. Null when too few samples. */
  cycle: Dist | null;
  /** Shop sessions from ready to done, all history. Null when too few samples. */
  wait: Dist | null;
  /** Sessions waited after which an open part here counts as at risk (wait p85 or a fallback). */
  waitNorm: number;
  waitNormSource: "process" | "shop" | "default";
  ready: number;
  inProgress: number;
  upcoming: number;
  oldestAgeSessions: number | null;
  reworked: number;
  atRisk: number;
  stuck: number;
};

export type OpenItem = {
  partInstanceId: number;
  label: string;
  partNumber: string;
  processId: number;
  processName: string;
  state: "ready" | "doing";
  readySince: number;
  ageSessions: number;
  ageShopMin: number;
  priority: boolean;
  flag: "ok" | "risk" | "stuck";
};

export type CyclePoint = {
  completedAt: number;
  processId: number;
  minutes: number;
  label: string;
};

export type HeatCell = { weekday: number; hour: number; n: number };

export type PersonStats = { userId: string; completed: number; started: number; sessions: number };

export type Kpis = {
  stepsCompleted: number;
  partsCompleted: number;
  sessions: number;
  stepsPerSession: number | null;
  openParts: number;
  ready: number;
  inProgress: number;
  cycleP50Min: number | null;
  reworked: number;
  prev: { stepsCompleted: number; sessions: number; stepsPerSession: number | null };
};

export type AnalyticsReport = {
  generatedAt: number;
  timeZone: string;
  window: { from: number; to: number; days: number | null };
  kpis: Kpis;
  sessions: SessionPoint[];
  processes: ProcessStats[];
  open: OpenItem[];
  cycles: CyclePoint[];
  heatmap: HeatCell[];
  /** Per-person counts; only included for admins. */
  people: PersonStats[] | null;
  insights: Insight[];
  /** Caveats about the data behind the numbers. */
  notes: string[];
};

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  return percentile(
    [...values].sort((a, b) => a - b),
    0.5,
  );
}

function dist(values: number[]): Dist | null {
  if (values.length < MIN_SAMPLES) return null;
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    p50: percentile(s, 0.5),
    p85: percentile(s, 0.85),
    p95: percentile(s, 0.95),
  };
}

/** Weekday (0 = Sunday), hour and a short label for a time in the shop's time zone. */
export function zoned(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(ms);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    weekday,
    hour: Number(get("hour")) % 24,
    label: `${get("weekday")} ${get("month")} ${get("day")}`,
  };
}

const minutes = (ms: number) => Math.round(ms / 60_000);

export function computeReport(
  model: Model,
  opts: { from: number; to: number; days: number | null; timeZone: string; includePeople: boolean },
): AnalyticsReport {
  const { from, to, timeZone } = opts;
  const inWindow = (t: number) => t >= from && t <= to;
  const length = to - from;
  const inPrev = (t: number) => t >= from - length && t < from;

  const sessions = model.sessions.filter((s) => inWindow(s.end));
  const prevSessions = model.sessions.filter((s) => inPrev(s.end));
  const runs = model.runs.filter((r) => inWindow(r.completedAt));
  const prevRuns = model.runs.filter((r) => inPrev(r.completedAt));

  const sessionPoints: SessionPoint[] = sessions.map((s) => ({
    start: s.start,
    end: s.end,
    label: zoned(s.start, timeZone).label,
    completed: s.events.filter((e) => e.action === "completed").length,
    started: s.events.filter((e) => e.action === "started").length,
    people: new Set(s.events.map((e) => e.userId)).size,
    live: s.live,
  }));
  const perSession = median(sessionPoints.filter((s) => !s.live).map((s) => s.completed));
  const prevPerSession = median(
    prevSessions.map((s) => s.events.filter((e) => e.action === "completed").length),
  );

  // Norms come from all history: the shop's history is short, and a norm should be stable.
  const allWaits = model.runs.flatMap((r) => (r.waitSessions === null ? [] : [r.waitSessions]));
  const shopWait = dist(allWaits);
  const runsByProcess = groupBy(model.runs, (r) => r.processId);

  const processIds = new Set<number>([
    ...model.runs.map((r) => r.processId),
    ...model.open.map((o) => o.processId),
    ...model.upcoming.keys(),
  ]);

  const open: OpenItem[] = [];
  const processes: ProcessStats[] = [...processIds].map((id) => {
    const history = runsByProcess.get(id) ?? [];
    const cycle = dist(history.flatMap((r) => (r.cycleMs === null ? [] : [minutes(r.cycleMs)])));
    const wait = dist(history.flatMap((r) => (r.waitSessions === null ? [] : [r.waitSessions])));
    const [waitNorm, waitNormSource] = wait
      ? [Math.max(1, Math.round(wait.p85)), "process" as const]
      : shopWait
        ? [Math.max(1, Math.round(shopWait.p85)), "shop" as const]
        : [DEFAULT_WAIT_NORM, "default" as const];
    const stuckAfter = Math.max(waitNorm + 2, waitNorm * 2);

    const here = model.open.filter((o) => o.processId === id);
    let atRisk = 0;
    let stuck = 0;
    for (const o of here) {
      const flag = o.ageSessions >= stuckAfter ? "stuck" : o.ageSessions > waitNorm ? "risk" : "ok";
      if (flag === "stuck") stuck++;
      if (flag === "risk") atRisk++;
      const { label, partNumber } = model.partLabel(o.partInstanceId);
      open.push({
        partInstanceId: o.partInstanceId,
        label,
        partNumber,
        processId: id,
        processName: model.processName(id),
        state: o.state,
        readySince: o.readyAt,
        ageSessions: o.ageSessions,
        ageShopMin: minutes(o.ageShopMs),
        priority: o.priority,
        flag,
      });
    }

    return {
      id,
      name: model.processName(id),
      completed: runs.filter((r) => r.processId === id).length,
      cycle,
      wait,
      waitNorm,
      waitNormSource,
      ready: here.filter((o) => o.state === "ready").length,
      inProgress: here.filter((o) => o.state === "doing").length,
      upcoming: model.upcoming.get(id) ?? 0,
      oldestAgeSessions: here.length ? Math.max(...here.map((o) => o.ageSessions)) : null,
      reworked: model.events.filter(
        (e) => e.processId === id && e.action === "reopened" && inWindow(e.createdAt),
      ).length,
      atRisk,
      stuck,
    };
  });
  processes.sort(
    (a, b) =>
      b.ready + b.inProgress - (a.ready + a.inProgress) ||
      b.upcoming - a.upcoming ||
      b.completed - a.completed,
  );
  open.sort((a, b) => b.ageSessions - a.ageSessions || a.readySince - b.readySince);

  const cycles: CyclePoint[] = runs.flatMap((r) =>
    r.cycleMs === null
      ? []
      : [
          {
            completedAt: r.completedAt,
            processId: r.processId,
            minutes: minutes(r.cycleMs),
            label: model.partLabel(r.partInstanceId).label,
          },
        ],
  );

  const heat = new Map<string, HeatCell>();
  for (const r of runs) {
    const { weekday, hour } = zoned(r.completedAt, timeZone);
    const key = `${weekday}:${hour}`;
    const cell = heat.get(key) ?? { weekday, hour, n: 0 };
    cell.n++;
    heat.set(key, cell);
  }

  const reworked = model.events.filter((e) => e.action === "reopened" && inWindow(e.createdAt));

  return {
    generatedAt: model.now,
    timeZone,
    window: { from, to, days: opts.days },
    kpis: {
      stepsCompleted: runs.length,
      partsCompleted: model.finished.filter((f) => inWindow(f.finishedAt)).length,
      sessions: sessions.length,
      stepsPerSession: perSession,
      openParts: model.open.length,
      ready: model.open.filter((o) => o.state === "ready").length,
      inProgress: model.open.filter((o) => o.state === "doing").length,
      cycleP50Min: median(cycles.map((c) => c.minutes)),
      reworked: reworked.length,
      prev: {
        stepsCompleted: prevRuns.length,
        sessions: prevSessions.length,
        stepsPerSession: prevPerSession,
      },
    },
    sessions: sessionPoints,
    processes,
    open,
    cycles,
    heatmap: [...heat.values()],
    people: opts.includePeople ? peopleStats(model, runs, from, to) : null,
    insights: findInsights(model, { processes, open, sessions: sessionPoints }),
    notes: dataNotes(runs),
  };
}

function peopleStats(model: Model, runs: StepRun[], from: number, to: number): PersonStats[] {
  const byUser = new Map<string, PersonStats>();
  const get = (userId: string) => {
    let p = byUser.get(userId);
    if (!p) {
      p = { userId, completed: 0, started: 0, sessions: 0 };
      byUser.set(userId, p);
    }
    return p;
  };
  for (const r of runs) get(r.userId).completed++;
  for (const e of model.events) {
    if (e.action === "started" && e.createdAt >= from && e.createdAt <= to) get(e.userId).started++;
  }
  for (const s of model.sessions) {
    if (s.end < from || s.end > to) continue;
    for (const userId of new Set(s.events.map((e) => e.userId))) get(userId).sessions++;
  }
  return [...byUser.values()].sort((a, b) => b.completed - a.completed || b.started - a.started);
}

function dataNotes(runs: StepRun[]): string[] {
  const notes: string[] = [];
  if (runs.length === 0) return notes;
  const pct = (n: number) => Math.round((100 * n) / runs.length);
  const noStart = runs.filter((r) => r.startedAt === null).length;
  const together = runs.filter((r) => r.loggedTogether).length;
  if (noStart / runs.length >= 0.1) {
    notes.push(
      `${pct(noStart)}% of finished steps were never marked In Progress, so they have no cycle time.`,
    );
  }
  if (together / runs.length >= 0.1) {
    notes.push(
      `${pct(together)}% of finished steps were marked In Progress and done within 2 minutes (logged after the work), so they have no cycle time.`,
    );
  }
  return notes;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k) ?? [];
    list.push(item);
    out.set(k, list);
  }
  return out;
}
