import { loadConfig } from "./core/config";
import { openDb } from "./core/db";
import type { EdgeModule, ModuleContext } from "./core/module";
import { startServer } from "./core/server";
import { AGENT_VERSION } from "./core/version";
import { createWorkerClient } from "./core/worker-client";
import { createNetworkModule } from "./modules/network";
import { createPrintModule } from "./modules/print";

const config = loadConfig();
const startedAt = Math.floor(Date.now() / 1000);
const ctx: ModuleContext = {
  config,
  db: openDb(config.dbPath),
  worker: createWorkerClient(config, startedAt),
};

const modules: EdgeModule[] = [createNetworkModule(ctx), createPrintModule(ctx)];

for (const m of modules) await m.start();
const server = startServer(config.httpPort, modules, startedAt, config.agentKey);
console.log(
  `[agent] g3-edge-agent ${AGENT_VERSION} listening on 127.0.0.1:${server.port}${config.mock ? " (mock mode)" : ""}`,
);

async function shutdown(signal: string) {
  console.log(`[agent] ${signal}, shutting down`);
  server.stop();
  for (const m of modules) await m.stop();
  ctx.db.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
