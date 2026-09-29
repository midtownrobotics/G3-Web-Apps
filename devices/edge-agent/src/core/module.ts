import type { Database } from "bun:sqlite";
import type { Hono } from "hono";
import type { AgentConfig } from "./config";
import type { WorkerClient } from "./worker-client";

export interface ModuleContext {
  config: AgentConfig;
  db: Database;
  worker: WorkerClient;
}

/**
 * A feature module (network, and later print, ...). Core starts each module and
 * mounts its routes at /<name>; modules never import each other.
 */
export interface EdgeModule {
  name: string;
  routes?: Hono;
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  /** Reported by GET /health. */
  status(): Record<string, unknown>;
}
