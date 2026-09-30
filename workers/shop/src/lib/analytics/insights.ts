import type { OpenItem, ProcessStats, SessionPoint } from "./metrics";
import type { Model } from "./model";

// Candidate insights, each scored by how unusual it is against the shop's own history. The
// analytics page lists them all; Slack messages take the top few. Anything without enough
// history behind it is not raised at all.

export type Insight = {
  id: string;
  kind:
    | "stuck"
    | "priority"
    | "bottleneck"
    | "idle"
    | "session"
    | "record"
    | "shift"
    | "cycle"
    | "rework";
  /** Higher is more worth telling people about. Roughly 0–100. */
  score: number;
  tone: "bad" | "good" | "info";
  title: string;
  detail: string;
  processId?: number;
};

/** Sessions needed before comparing a session against "normal". */
const MIN_PRIOR_SESSIONS = 4;
/** Samples needed on each side before comparing a machine's recent cycle time with its past. */
const MIN_CYCLE_SAMPLES = 5;
/** Sessions of history needed before comparing the last 3 sessions' cycle times with the rest. */
const MIN_CYCLE_SESSIONS = 6;

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export function findInsights(
  model: Model,
  report: { processes: ProcessStats[]; open: OpenItem[]; sessions: SessionPoint[] },
): Insight[] {
  const out: Insight[] = [];
  const { processes, open } = report;

  // Parts waiting far longer than is normal for their machine.
  for (const p of processes) {
    const here = open.filter((o) => o.processId === p.id && o.flag !== "ok");
    const stuck = here.filter((o) => o.flag === "stuck");
    const flagged = stuck.length > 0 ? stuck : here;
    if (flagged.length === 0) continue;
    const oldest = flagged[0];
    const norm =
      p.waitNormSource === "process"
        ? `85% of ${p.name} steps are done within ${plural(p.waitNorm, "session")} of becoming ready.`
        : p.waitNormSource === "shop"
          ? `Shop-wide, 85% of steps are done within ${plural(p.waitNorm, "session")} of becoming ready.`
          : `Flagged after ${plural(p.waitNorm, "session")} (not enough history for a norm yet).`;
    out.push({
      id: `stuck:${p.id}`,
      kind: "stuck",
      score:
        stuck.length > 0 ? Math.min(90, 60 + 8 * stuck.length) : Math.min(50, 32 + 4 * here.length),
      tone: "bad",
      processId: p.id,
      title: `${plural(flagged.length, "part")} ${stuck.length > 0 ? "stuck" : "at risk"} at ${p.name}`,
      detail: `Oldest: ${oldest.label}, waiting through ${plural(oldest.ageSessions, "shop session")}. ${norm}`,
    });
  }

  // Priority parts that have waited more than a session.
  const waitingPriority = open.filter((o) => o.priority && o.ageSessions >= 2);
  if (waitingPriority.length > 0) {
    const first = waitingPriority[0];
    const others = waitingPriority.length - 1;
    out.push({
      id: "priority",
      kind: "priority",
      score: 55 + 5 * Math.min(others, 5),
      tone: "bad",
      processId: first.processId,
      title: `Priority part waiting at ${first.processName}`,
      detail: `${first.label} has waited through ${plural(first.ageSessions, "shop session")}${
        others > 0 ? `; ${plural(others, "other priority part")} also waiting` : ""
      }.`,
    });
  }

  // One machine holding a large share of the ready work.
  const totalReady = processes.reduce((n, p) => n + p.ready, 0);
  const top = [...processes].sort((a, b) => b.ready - a.ready)[0];
  if (top && top.ready >= 4 && top.ready / totalReady >= 0.3) {
    const share = top.ready / totalReady;
    out.push({
      id: `bottleneck:${top.id}`,
      kind: "bottleneck",
      score: Math.round(30 + 40 * share),
      tone: "info",
      processId: top.id,
      title: `${top.name} holds ${Math.round(share * 100)}% of the ready work`,
      detail: `${top.ready} of ${totalReady} ready parts are waiting there${
        top.upcoming > 0
          ? `, and ${plural(top.upcoming, "more part")} will reach it after earlier steps`
          : ""
      }.`,
    });
  }

  const finished = model.sessions.filter((s) => !s.live);
  const recent = finished.slice(-2);

  // Machines with a queue that nobody worked in the last two sessions.
  if (recent.length === 2) {
    const since = recent[0].start;
    for (const p of processes) {
      if (p.ready < 3) continue;
      const worked = model.events.some((e) => e.processId === p.id && e.createdAt >= since);
      const everWorked = model.runs.some((r) => r.processId === p.id);
      if (worked || !everWorked) continue;
      out.push({
        id: `idle:${p.id}`,
        kind: "idle",
        score: 35 + Math.min(20, 2 * p.ready),
        tone: "bad",
        processId: p.id,
        title: `Nobody worked ${p.name} in the last 2 sessions`,
        detail: `${plural(p.ready, "part")} ${p.ready === 1 ? "is" : "are"} ready there.`,
      });
    }
  }

  // The latest session against the ones before it.
  const last = model.sessions[model.sessions.length - 1];
  const prior = model.sessions.slice(0, -1).filter((s) => !s.live);
  if (last && prior.length >= MIN_PRIOR_SESSIONS) {
    const done = (s: (typeof prior)[number]) =>
      s.events.filter((e) => e.action === "completed").length;
    const lastDone = done(last);
    const counts = prior.map(done).sort((a, b) => a - b);
    const typical = counts[Math.floor(counts.length / 2)];
    const best = counts[counts.length - 1];
    const when = last.live ? "this session" : "last session";
    if (lastDone > best) {
      out.push({
        id: "record",
        kind: "record",
        score: 45,
        tone: "good",
        title: "Most steps finished in a session since tracking began",
        detail: `${plural(lastDone, "step")} ${when}; the previous best was ${best}.`,
      });
    } else if (typical > 0) {
      const ratio = lastDone / typical;
      if (ratio >= 1.4 || ratio <= 0.7) {
        const up = ratio > 1;
        out.push({
          id: "session",
          kind: "session",
          score: Math.round(25 + 20 * Math.abs(Math.log2(Math.max(ratio, 0.1)))),
          tone: up ? "good" : "bad",
          title: `${up ? "Busier" : "Quieter"} than usual ${when}`,
          detail: `${plural(lastDone, "step")} finished vs a typical ${typical} per session.`,
        });
      }
    }
  }

  // Run-chart shift rule (Anhøj): a run on one side of the median longer than log2(n) + 3.
  const shift = detectShift(
    finished.map((s) => s.events.filter((e) => e.action === "completed").length),
  );
  if (shift) {
    out.push({
      id: "shift",
      kind: "shift",
      score: 40,
      tone: shift.side === "above" ? "good" : "bad",
      title: `Throughput has shifted ${shift.side === "above" ? "up" : "down"}`,
      detail: `The last ${shift.length} sessions all finished ${shift.side} the usual ${shift.median} steps per session.`,
    });
  }

  // A machine's recent cycle time against its own past.
  if (finished.length >= MIN_CYCLE_SESSIONS) {
    const cutoff = finished.slice(-3)[0].start;
    for (const p of processes) {
      const cycles = model.runs.filter((r) => r.processId === p.id && r.cycleMs !== null);
      const before = cycles.filter((r) => r.completedAt < cutoff).map((r) => r.cycleMs as number);
      const lately = cycles.filter((r) => r.completedAt >= cutoff).map((r) => r.cycleMs as number);
      if (before.length < MIN_CYCLE_SAMPLES || lately.length < MIN_CYCLE_SAMPLES) continue;
      const b = mid(before);
      const l = mid(lately);
      if (b <= 0) continue;
      const ratio = l / b;
      if (ratio < 1.5 && ratio > 1 / 1.5) continue;
      const slower = ratio > 1;
      out.push({
        id: `cycle:${p.id}`,
        kind: "cycle",
        score: Math.min(55, Math.round(30 + 12 * Math.abs(Math.log2(ratio)))),
        tone: slower ? "bad" : "good",
        processId: p.id,
        title: `${p.name} steps are taking ${slower ? "longer" : "less time"}`,
        detail: `Median ${fmtMinutes(l)} of shop time over the last 3 sessions vs ${fmtMinutes(b)} before.`,
      });
    }
  }

  // Steps sent back from done in the latest session.
  if (last) {
    const sentBack = last.events.filter((e) => e.action === "reopened");
    if (sentBack.length > 0) {
      const where = [...new Set(sentBack.map((e) => model.processName(e.processId)))];
      out.push({
        id: "rework",
        kind: "rework",
        score: Math.min(45, 20 + 5 * sentBack.length),
        tone: "bad",
        title: `${plural(sentBack.length, "step")} sent back to redo`,
        detail: `${last.live ? "This" : "Last"} session, at ${where.join(", ")}.`,
      });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}

/** The run of points on one side of the median that ends at the latest point, if it's a signal. */
export function detectShift(
  values: number[],
): { side: "above" | "below"; length: number; median: number } | null {
  if (values.length < 8) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const m =
    sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const sides = values.filter((v) => v !== m).map((v) => (v > m ? 1 : -1));
  if (sides.length === 0) return null;
  const limit = Math.round(Math.log2(sides.length) + 3);
  const lastSide = sides[sides.length - 1];
  let length = 0;
  for (let i = sides.length - 1; i >= 0 && sides[i] === lastSide; i--) length++;
  if (length <= limit) return null;
  return { side: lastSide > 0 ? "above" : "below", length, median: Math.round(m * 10) / 10 };
}

function mid(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

export function fmtMinutes(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
