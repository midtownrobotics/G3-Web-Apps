import type { EdgeApp } from "@g3/worker-edge";
import { hc } from "hono/client";
import type { AgentConfig } from "./config";
import { AGENT_VERSION } from "./version";

/**
 * Typed client for the worker's agent routes. Every request carries the shared
 * key and the desired-state version this box has applied.
 */
export function createWorkerClient(config: AgentConfig, startedAt: number, sync: SyncState) {
  return hc<EdgeApp>(config.workerUrl, {
    headers: () => ({
      Authorization: `Bearer ${config.agentKey}`,
      "X-G3-Agent-Version": AGENT_VERSION,
      "X-G3-Agent-Started": String(startedAt),
      "X-G3-Agent-State-Version": String(sync.applied),
    }),
  });
}

/** The desired-state version (from the worker) that has been applied on this box. */
export interface SyncState {
  applied: number;
}

/** The worker's current desired-state version, from an agent response (0 if absent). */
export function desiredVersion(res: { headers: Headers }) {
  return Number(res.headers.get("X-G3-State-Version") ?? 0) || 0;
}

export type WorkerClient = ReturnType<typeof createWorkerClient>;
