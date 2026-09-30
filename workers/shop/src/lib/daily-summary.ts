import { and, eq, gte } from "drizzle-orm";
import type { createShopDb } from "../db";
import { actions, partInstanceProcesses, partInstances, processes } from "../db/schema";

type Db = ReturnType<typeof createShopDb>;

export type DailyStats = {
  partsCompleted: number;
  partsLeft: number;
  stepsCompleted: number;
  priorityCompleted: number;
  partsAdded: number;
  /** Steps finished today per process, busiest first. */
  byProcess: { name: string; steps: number }[];
  /** Steps completed today per user, most first. */
  byUser: { userId: string; steps: number }[];
  firstAt: number | null;
  lastAt: number | null;
};

/**
 * What happened in the shop since `since` (ms). Step counts include parts made obsolete since
 * (the work still happened); part counts only cover current parts, which are completed once
 * every step is done.
 */
export async function getDailyStats(db: Db, since: number): Promise<DailyStats> {
  const [instances, steps, procs, todaysActions] = await Promise.all([
    db
      .select({
        id: partInstances.id,
        isPriority: partInstances.isPriority,
        createdAt: partInstances.createdAt,
      })
      .from(partInstances)
      .where(eq(partInstances.isStale, 0))
      .all(),
    db
      .select({
        partInstanceId: partInstanceProcesses.partInstanceId,
        processId: partInstanceProcesses.processId,
        status: partInstanceProcesses.status,
        completedAt: partInstanceProcesses.completedAt,
      })
      .from(partInstanceProcesses)
      .all(),
    db.select({ id: processes.id, name: processes.name }).from(processes).all(),
    db
      .select({ userId: actions.userId, createdAt: actions.createdAt })
      .from(actions)
      .where(and(eq(actions.action, "completed"), gte(actions.createdAt, since)))
      .all(),
  ]);

  const stepsByInstance = new Map<number, typeof steps>();
  for (const s of steps) {
    const list = stepsByInstance.get(s.partInstanceId) ?? [];
    list.push(s);
    stepsByInstance.set(s.partInstanceId, list);
  }

  const doneToday = steps.filter(
    (s) => s.status === "done" && s.completedAt !== null && s.completedAt >= since,
  );
  const processSteps = new Map<number, number>();
  for (const s of doneToday) {
    processSteps.set(s.processId, (processSteps.get(s.processId) ?? 0) + 1);
  }
  const doneTimes = doneToday.map((s) => s.completedAt as number);

  let partsCompleted = 0;
  let partsLeft = 0;
  let priorityCompleted = 0;
  for (const inst of instances) {
    const instSteps = stepsByInstance.get(inst.id) ?? [];
    if (instSteps.length === 0) continue;
    if (instSteps.every((s) => s.status === "done")) {
      const finishedAt = Math.max(...instSteps.map((s) => s.completedAt ?? 0));
      if (finishedAt >= since) {
        partsCompleted++;
        if (inst.isPriority) priorityCompleted++;
      }
    } else {
      partsLeft++;
    }
  }

  const procName = new Map(procs.map((p) => [p.id, p.name]));
  const byProcess = [...processSteps]
    .map(([id, n]) => ({ name: procName.get(id) ?? `Process #${id}`, steps: n }))
    .sort((a, b) => b.steps - a.steps);

  const userSteps = new Map<string, number>();
  for (const a of todaysActions) userSteps.set(a.userId, (userSteps.get(a.userId) ?? 0) + 1);
  const byUser = [...userSteps]
    .map(([userId, n]) => ({ userId, steps: n }))
    .sort((a, b) => b.steps - a.steps);

  return {
    partsCompleted,
    partsLeft,
    stepsCompleted: doneToday.length,
    priorityCompleted,
    partsAdded: instances.filter((i) => i.createdAt >= since).length,
    byProcess,
    byUser,
    firstAt: doneTimes.length ? Math.min(...doneTimes) : null,
    lastAt: doneTimes.length ? Math.max(...doneTimes) : null,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Slack message for the day: the counts, then a few generated lines reflecting on what happened. */
export function formatDailySummary(
  stats: DailyStats,
  opts: { dayLabel: string; timeZone: string; names: Map<string, string> },
): string {
  const time = (ms: number) =>
    new Date(ms).toLocaleTimeString("en-US", {
      timeZone: opts.timeZone,
      hour: "numeric",
      minute: "2-digit",
    });

  const lines = [
    `*Shop rundown for ${opts.dayLabel}*`,
    `:white_check_mark: *${stats.partsCompleted}* ${stats.partsCompleted === 1 ? "part" : "parts"} completed today  ·  *${stats.partsLeft}* left to do`,
  ];

  if (stats.stepsCompleted === 0) {
    lines.push("", "Quiet day in the shop — no process steps were finished.");
    if (stats.partsAdded > 0) lines.push(`• ${plural(stats.partsAdded, "new part")} added.`);
    return lines.join("\n");
  }

  const reflection = [`${plural(stats.stepsCompleted, "process step")} finished.`];

  const [busiest, runnerUp] = stats.byProcess;
  if (busiest) {
    const then = runnerUp ? `, then ${runnerUp.name} (${runnerUp.steps})` : "";
    reflection.push(`Busiest process: ${busiest.name} (${plural(busiest.steps, "step")})${then}.`);
  }

  const top = stats.byUser
    .slice(0, 3)
    .map(
      (u, i) =>
        `${opts.names.get(u.userId) ?? "Someone"} (${i === 0 ? plural(u.steps, "step") : u.steps})`,
    );
  if (top.length > 0) reflection.push(`Most active: ${top.join(", ")}.`);

  if (stats.byUser.length > 0 && stats.firstAt !== null && stats.lastAt !== null) {
    const span =
      stats.lastAt - stats.firstAt < 60_000
        ? `at ${time(stats.firstAt)}`
        : `from ${time(stats.firstAt)} to ${time(stats.lastAt)}`;
    const people = stats.byUser.length;
    reflection.push(`${people} ${people === 1 ? "person" : "people"} logged work ${span}.`);
  }

  if (stats.priorityCompleted > 0) {
    reflection.push(`${plural(stats.priorityCompleted, "priority part")} finished.`);
  }
  if (stats.partsAdded > 0) reflection.push(`${plural(stats.partsAdded, "new part")} added.`);

  lines.push("", ...reflection.map((l) => `• ${l}`));
  return lines.join("\n");
}
