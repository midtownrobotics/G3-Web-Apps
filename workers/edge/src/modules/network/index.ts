import type { AppEnv } from "../../types";
import { rollupUsage } from "./rollup";
import { rollupSites } from "./sites";

export { networkAgentRouter, networkRouter } from "./routes";

export async function networkScheduled(env: AppEnv["Bindings"]) {
  await rollupUsage(env.EDGE_DB);
  await rollupSites(env.EDGE_DB);
}
