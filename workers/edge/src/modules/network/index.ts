import type { AppEnv } from "../../types";
import { rollupUsage } from "./rollup";

export { networkAgentRouter, networkRouter } from "./routes";

export async function networkScheduled(env: AppEnv["Bindings"]) {
  await rollupUsage(env.EDGE_DB);
}
