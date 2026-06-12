import type { PartDefinition, PartInstance, PartInstanceProcess, Process } from "./types";
import type { ShopData } from "./use-shop-data";

/** A part instance joined with its definition and process pipeline. */
export type InstanceRow = {
  instance: PartInstance;
  definition: PartDefinition;
  /** Pipeline rows sorted by index. */
  procs: PartInstanceProcess[];
  /** First non-done process — what the part is on right now. Null when finished. */
  current: PartInstanceProcess | null;
  state: InstanceState;
};

export type InstanceState = "todo" | "doing" | "waiting" | "complete" | "no-processes";

export const STATE_META: Record<InstanceState, { label: string; badge: string }> = {
  todo: { label: "To Do", badge: "bg-steel-tint text-steel-dark border-steel/40" },
  doing: { label: "In Progress", badge: "bg-amber-50 text-amber-700 border-amber-300" },
  waiting: { label: "Waiting", badge: "bg-mist text-steel border-steel/30" },
  complete: { label: "Complete", badge: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  "no-processes": { label: "No Processes", badge: "bg-mist text-steel border-dashed border-steel/40" },
};

/** Join non-stale instances with their definitions and pipelines. */
export function buildInstanceRows(data: ShopData): InstanceRow[] {
  const defById = new Map(data.definitions.map((d) => [d.id, d]));
  const procsByInstance = new Map<number, PartInstanceProcess[]>();
  for (const p of data.instanceProcesses) {
    const list = procsByInstance.get(p.partInstanceId);
    if (list) list.push(p);
    else procsByInstance.set(p.partInstanceId, [p]);
  }

  const rows: InstanceRow[] = [];
  for (const instance of data.instances) {
    if (instance.isStale) continue;
    const definition = defById.get(instance.partDefinitionId);
    if (!definition) continue;
    const procs = (procsByInstance.get(instance.id) ?? []).sort((a, b) => a.index - b.index);
    const current = procs.find((p) => p.status !== "done") ?? null;
    const state: InstanceState =
      procs.length === 0
        ? "no-processes"
        : current === null
          ? "complete"
          : (current.status as InstanceState);
    rows.push({ instance, definition, procs, current, state });
  }
  return rows;
}

export function partLabel(row: InstanceRow): string {
  return `${row.definition.onshapePartNumber} · Rev ${row.definition.revision}`;
}

// ── Shop floor load + mood ────────────────────────────────────────────────────

export type ProcessLoad = {
  process: Process;
  todo: number;
  doing: number;
  level: "none" | "medium" | "high";
};

export function processLoads(rows: InstanceRow[], processes: Process[]): ProcessLoad[] {
  return processes.map((process) => {
    let todo = 0;
    let doing = 0;
    for (const row of rows) {
      if (row.current?.processId !== process.id) continue;
      if (row.current.status === "todo") todo += 1;
      if (row.current.status === "doing") doing += 1;
    }
    const open = todo + doing;
    return { process, todo, doing, level: open === 0 ? "none" : open >= 5 ? "high" : "medium" };
  });
}

export type ShopMood = {
  label: string;
  blurb: string;
  tone: "calm" | "steady" | "warn" | "hot";
};

/** A loose read on how the shop is doing, based on what's running vs. piling up. */
export function shopMood(loads: ProcessLoad[]): ShopMood {
  const todo = loads.reduce((n, l) => n + l.todo, 0);
  const doing = loads.reduce((n, l) => n + l.doing, 0);
  const busyProcs = loads.filter((l) => l.doing > 0).length;
  const total = loads.length || 1;

  if (todo === 0 && doing === 0) {
    return {
      label: "Chillin'",
      blurb: "Nothing in the queue. Enjoy it while it lasts.",
      tone: "calm",
    };
  }
  if (doing === 0) {
    if (todo >= 8) {
      return {
        label: "Lazy",
        blurb: `${todo} parts are ready to go and nothing is running. Time to spin up.`,
        tone: "warn",
      };
    }
    return {
      label: "Easygoing",
      blurb: `${todo} part${todo === 1 ? " is" : "s are"} ready, nothing started yet.`,
      tone: "calm",
    };
  }
  if (todo >= 12 && busyProcs >= Math.ceil(total / 2)) {
    return {
      label: "Cooked",
      blurb: `${doing} running and ${todo} still waiting — the shop is slammed.`,
      tone: "hot",
    };
  }
  if (busyProcs >= Math.ceil(total * 0.6) || doing >= 5) {
    return {
      label: "Busy",
      blurb: `${doing} in progress across ${busyProcs} process${busyProcs === 1 ? "" : "es"}, ${todo} up next.`,
      tone: "warn",
    };
  }
  return {
    label: "Cruisin'",
    blurb: `Steady pace — ${doing} in progress, ${todo} ready to start.`,
    tone: "steady",
  };
}
