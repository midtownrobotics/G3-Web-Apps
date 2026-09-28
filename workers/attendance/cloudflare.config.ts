import {
  accountId,
  integrations,
  modeOf,
  workerBase,
  workerScriptName,
} from "@g3/config/cloudflare";
import { bindings, defineConfig, triggers } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig(({ mode: rawMode }) => {
  const mode = modeOf(rawMode);
  return {
    accountId,
    worker: {
      ...workerBase("attendance", mode),
      entrypoint,
      triggers: [triggers.scheduled({ schedule: "0 * * * *" })],
      env: {
        FIREBASE_PROJECT_ID: bindings.text(integrations.firebaseProjectId),
        G3ID: bindings.worker({ worker: workerScriptName("g3id", mode) }),
        FIREBASE_CLIENT_EMAIL: bindings.secret(),
        FIREBASE_PRIVATE_KEY: bindings.secret(),
      },
    },
  };
});
