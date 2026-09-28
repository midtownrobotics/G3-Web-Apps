import {
  accountId,
  d1,
  modeOf,
  r2Buckets,
  workerBase,
  workerScriptName,
} from "@g3/config/cloudflare";
import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig(({ mode: rawMode }) => {
  const mode = modeOf(rawMode);
  return {
    accountId,
    worker: {
      ...workerBase("scouting", mode),
      entrypoint,
      env: {
        AI: bindings.ai(),
        SCOUTING_DB: bindings.d1(d1("scouting", mode)),
        FIELD_MAPS: bindings.r2({ name: r2Buckets.fieldMaps }),
        G3ID: bindings.worker({ worker: workerScriptName("g3id", mode) }),
        LOCAL_AUTH_BYPASS: bindings.text(mode === "development" ? "true" : "false"),
        SLACK_BOT_TOKEN: bindings.secret(),
        TBA_AUTH_KEY: bindings.secret(),
        NEXUS_API_KEY: bindings.secret(),
      },
    },
  };
});
