import type { ActionType } from "../../db/schema";

// The shop's event model. The shop meets a few evenings a week, so calendar time between two
// events mostly counts closed days. Everything here measures time the way the shop experiences
// it instead: shop sessions (clusters of logged activity) and time inside them ("shop time").

/** Activity separated by more than this starts a new session (longest in-session gap seen: 2.5 h). */
export const SESSION_GAP_MS = 3 * 3_600_000;
/** Fewer events than this is a stray edit (someone fixing a status from home), not a session. */
export const MIN_SESSION_EVENTS = 5;
/** The same action on the same step again within this window is a double tap. */
const DUPLICATE_MS = 2 * 60_000;
/** Started and finished closer together than this: logged after the fact, not a timed step. */
export const UNTIMED_MS = 2 * 60_000;

export type AnalyticsInput = {
  actions: {
    id: number;
    userId: string;
    partInstanceId: number;
    processId: number;
    action: ActionType;
    createdAt: number;
    partDefinitionId: number | null;
    partNumber: string | null;
    partName: string | null;
    instanceNumber: number | null;
    processName: string | null;
  }[];
  steps: {
    partInstanceId: number;
    processId: number;
    index: number;
    status: "waiting" | "todo" | "doing" | "done";
    completedAt: number | null;
  }[];
  instances: {
    id: number;
    partDefinitionId: number;
    instanceNumber: number;
    isPriority: number;
    isStale: number;
    createdAt: number;
  }[];
  definitions: { id: number; name: string | null; partNumber: string }[];
  processes: { id: number; name: string }[];
};

export type ShopEvent = AnalyticsInput["actions"][number];

export type Session = {
  start: number;
  end: number;
  events: ShopEvent[];
  /** Still going: the last event is recent enough that more may follow. */
  live: boolean;
};

/** One finished step, replayed from the event log. */
export type StepRun = {
  partInstanceId: number;
  processId: number;
  userId: string;
  completedAt: number;
  /** Latest start before completion (a restart replaces the earlier one); null if never logged. */
  startedAt: number | null;
  /** When the step became workable: the previous step's completion, or the part's creation. */
  readyAt: number | null;
  /** Shop time from start to completion; null if never started or started and finished together. */
  cycleMs: number | null;
  /** Marked In Progress and done within UNTIMED_MS of each other. */
  loggedTogether: boolean;
  /** Shop sessions the step spanned from ready to done (1 = done in the session it became ready). */
  waitSessions: number | null;
  /** The step had been sent back from done before this completion. */
  rework: boolean;
};

/** A current part at its first unfinished step. */
export type OpenStep = {
  partInstanceId: number;
  processId: number;
  state: "ready" | "doing";
  readyAt: number;
  doingSince: number | null;
  ageSessions: number;
  ageShopMs: number;
  priority: boolean;
};

export type Model = {
  now: number;
  events: ShopEvent[];
  sessions: Session[];
  runs: StepRun[];
  open: OpenStep[];
  /** Later steps waiting behind each part's current step, per process. */
  upcoming: Map<number, number>;
  /** Current parts with every step done, and when the last one finished. */
  finished: { partInstanceId: number; finishedAt: number; priority: boolean }[];
  processName: (id: number) => string;
  partLabel: (partInstanceId: number) => { label: string; partNumber: string };
  shopMs: (from: number, to: number) => number;
  sessionsSpanned: (from: number, to: number) => number;
};

const stepKey = (partInstanceId: number, processId: number) => `${partInstanceId}:${processId}`;

/** Drop double taps: the same action on the same step within DUPLICATE_MS of the last one. */
export function dedupeEvents(actions: ShopEvent[]): ShopEvent[] {
  const sorted = [...actions].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  const last = new Map<string, ShopEvent>();
  const out: ShopEvent[] = [];
  for (const e of sorted) {
    const key = stepKey(e.partInstanceId, e.processId);
    const prev = last.get(key);
    if (prev && prev.action === e.action && e.createdAt - prev.createdAt < DUPLICATE_MS) continue;
    last.set(key, e);
    out.push(e);
  }
  return out;
}

/** Cluster events into shop sessions; clusters too small to be a session are dropped. */
export function findSessions(events: ShopEvent[], now: number): Session[] {
  const clusters: ShopEvent[][] = [];
  for (const e of events) {
    const current = clusters[clusters.length - 1];
    const prev = current?.[current.length - 1];
    if (current && prev && e.createdAt - prev.createdAt <= SESSION_GAP_MS) current.push(e);
    else clusters.push([e]);
  }
  return clusters
    .filter((c) => c.length >= MIN_SESSION_EVENTS)
    .map((c) => {
      const end = c[c.length - 1].createdAt;
      return { start: c[0].createdAt, end, events: c, live: now - end <= SESSION_GAP_MS };
    });
}

export function buildModel(input: AnalyticsInput, now: number): Model {
  const events = dedupeEvents(input.actions);
  const sessions = findSessions(events, now);

  const shopMs = (from: number, to: number) => {
    let total = 0;
    for (const s of sessions) {
      // A live session is still accruing time up to now.
      const end = s.live ? Math.max(s.end, now) : s.end;
      total += Math.max(0, Math.min(to, end) - Math.max(from, s.start));
    }
    return total;
  };
  const sessionsSpanned = (from: number, to: number) =>
    sessions.filter((s) => s.start <= to && (s.live ? now : s.end) >= from).length;

  const procName = new Map(input.processes.map((p) => [p.id, p.name]));
  const snapshotProc = new Map<number, string>();
  for (const e of events) if (e.processName) snapshotProc.set(e.processId, e.processName);
  const processName = (id: number) => procName.get(id) ?? snapshotProc.get(id) ?? `Process #${id}`;

  const instanceById = new Map(input.instances.map((i) => [i.id, i]));
  const defById = new Map(input.definitions.map((d) => [d.id, d]));
  const snapshotPart = new Map<number, ShopEvent>();
  for (const e of events) if (e.partName || e.partNumber) snapshotPart.set(e.partInstanceId, e);
  const partLabel = (partInstanceId: number) => {
    const inst = instanceById.get(partInstanceId);
    const def = inst ? defById.get(inst.partDefinitionId) : undefined;
    const snap = snapshotPart.get(partInstanceId);
    const name = def?.name ?? snap?.partName ?? def?.partNumber ?? snap?.partNumber;
    const number = inst?.instanceNumber ?? snap?.instanceNumber;
    return {
      label: name ? `${name} #${number ?? "?"}` : `Part ${partInstanceId}`,
      partNumber: def?.partNumber ?? snap?.partNumber ?? "",
    };
  };

  // Step order per live instance, to find when each step became workable.
  const stepsByInstance = new Map<number, AnalyticsInput["steps"]>();
  for (const s of input.steps) {
    const list = stepsByInstance.get(s.partInstanceId) ?? [];
    list.push(s);
    stepsByInstance.set(s.partInstanceId, list);
  }
  for (const list of stepsByInstance.values()) list.sort((a, b) => a.index - b.index);

  const completions = new Map<string, number[]>();
  for (const e of events) {
    if (e.action !== "completed") continue;
    const key = stepKey(e.partInstanceId, e.processId);
    const list = completions.get(key) ?? [];
    list.push(e.createdAt);
    completions.set(key, list);
  }

  // Per part, its completions at any process: for parts deleted since, the log is the only record.
  const partCompletions = new Map<number, { processId: number; at: number }[]>();
  for (const e of events) {
    if (e.action !== "completed") continue;
    const list = partCompletions.get(e.partInstanceId) ?? [];
    list.push({ processId: e.processId, at: e.createdAt });
    partCompletions.set(e.partInstanceId, list);
  }

  /** When the step became workable, as of time `at`. */
  const readyAtFor = (partInstanceId: number, processId: number, at: number): number | null => {
    const steps = stepsByInstance.get(partInstanceId);
    const inst = instanceById.get(partInstanceId);
    if (!steps || !inst) {
      // Deleted part: ready when its previous step (another process) last finished. The first
      // step's creation time is unknown, so it has no wait.
      const earlier = (partCompletions.get(partInstanceId) ?? []).filter(
        (c) => c.processId !== processId && c.at <= at,
      );
      return earlier.length > 0 ? earlier[earlier.length - 1].at : null;
    }
    const idx = steps.findIndex((s) => s.processId === processId);
    if (idx === -1) return null;
    if (idx === 0) return inst.createdAt;
    const prev = steps[idx - 1];
    const logged = (completions.get(stepKey(partInstanceId, prev.processId)) ?? []).filter(
      (t) => t <= at,
    );
    if (logged.length > 0) return logged[logged.length - 1];
    if (prev.completedAt !== null && prev.completedAt <= at) return prev.completedAt;
    return inst.createdAt;
  };

  // Replay each step's events into finished runs.
  const runs: StepRun[] = [];
  const replay = new Map<string, { startedAt: number | null; rework: boolean }>();
  const lastStart = new Map<string, number>();
  for (const e of events) {
    const key = stepKey(e.partInstanceId, e.processId);
    const state = replay.get(key) ?? { startedAt: null, rework: false };
    replay.set(key, state);
    if (e.action === "started") {
      state.startedAt = e.createdAt;
      lastStart.set(key, e.createdAt);
    } else if (e.action === "unstarted") {
      state.startedAt = null;
    } else if (e.action === "reopened") {
      state.startedAt = null;
      state.rework = true;
    } else {
      const readyAt = readyAtFor(e.partInstanceId, e.processId, e.createdAt);
      const together = state.startedAt !== null && e.createdAt - state.startedAt < UNTIMED_MS;
      runs.push({
        partInstanceId: e.partInstanceId,
        processId: e.processId,
        userId: e.userId,
        completedAt: e.createdAt,
        startedAt: state.startedAt,
        readyAt,
        cycleMs: state.startedAt === null || together ? null : shopMs(state.startedAt, e.createdAt),
        loggedTogether: together,
        waitSessions: readyAt === null ? null : Math.max(1, sessionsSpanned(readyAt, e.createdAt)),
        rework: state.rework,
      });
      state.startedAt = null;
    }
  }

  // Current parts at their first unfinished step.
  const open: OpenStep[] = [];
  const upcoming = new Map<number, number>();
  const finished: Model["finished"] = [];
  for (const inst of input.instances) {
    if (inst.isStale) continue;
    const steps = stepsByInstance.get(inst.id) ?? [];
    if (steps.length === 0) continue;
    const currentIdx = steps.findIndex((s) => s.status !== "done");
    if (currentIdx === -1) {
      const finishedAt = Math.max(...steps.map((s) => s.completedAt ?? 0));
      if (finishedAt > 0) {
        finished.push({ partInstanceId: inst.id, finishedAt, priority: inst.isPriority === 1 });
      }
      continue;
    }
    const current = steps[currentIdx];
    const readyAt = readyAtFor(inst.id, current.processId, now) ?? inst.createdAt;
    const started = lastStart.get(stepKey(inst.id, current.processId));
    open.push({
      partInstanceId: inst.id,
      processId: current.processId,
      state: current.status === "doing" ? "doing" : "ready",
      readyAt,
      doingSince: current.status === "doing" && started !== undefined ? started : null,
      ageSessions: sessionsSpanned(readyAt, now),
      ageShopMs: shopMs(readyAt, now),
      priority: inst.isPriority === 1,
    });
    for (const later of steps.slice(currentIdx + 1)) {
      upcoming.set(later.processId, (upcoming.get(later.processId) ?? 0) + 1);
    }
  }

  return {
    now,
    events,
    sessions,
    runs,
    open,
    upcoming,
    finished,
    processName,
    partLabel,
    shopMs,
    sessionsSpanned,
  };
}
