import { accountId, d1, modeOf, workerBase, workerScriptName } from "@g3/config/cloudflare";
import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig(({ mode: rawMode }) => {
  const mode = modeOf(rawMode);
  return {
    accountId,
    worker: {
      ...workerBase("pit", mode),
      entrypoint,
      env: {
        PIT_DB: bindings.d1(d1("pit", mode)),
        G3ID: bindings.worker({ worker: workerScriptName("g3id", mode) }),
        TBA_AUTH_KEY: bindings.secret(),
        NEXUS_API_KEY: bindings.secret(),
      },
    },
  };
});
