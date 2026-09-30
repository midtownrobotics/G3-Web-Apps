import type { EdgeApp } from "@g3/worker-edge";
import { hc } from "hono/client";
import type { AgentConfig } from "./config";
import { AGENT_VERSION } from "./version";

/** Typed client for the worker's agent routes. Every request carries the shared key. */
export function createWorkerClient(config: AgentConfig, startedAt: number) {
  return hc<EdgeApp>(config.workerUrl, {
    headers: {
      Authorization: `Bearer ${config.agentKey}`,
      "X-G3-Agent-Version": AGENT_VERSION,
      "X-G3-Agent-Started": String(startedAt),
    },
  });
}

export type WorkerClient = ReturnType<typeof createWorkerClient>;
