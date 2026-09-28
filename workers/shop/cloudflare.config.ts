import {
  accountId,
  appUrl,
  d1,
  kv,
  modeOf,
  queues,
  r2Buckets,
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
      ...workerBase("shop", mode),
      entrypoint,
      observability: { logs: { enabled: true, invocationLogs: true } },
      triggers: [triggers.queue({ name: queues.bomFetch })],
      env: {
        FRONTEND_URL: bindings.text(appUrl("shop", mode)),
        SESSIONS: bindings.kv(kv("sessions", mode)),
        SHOP_DB: bindings.d1(d1("shop", mode)),
        DRAWINGS: bindings.r2({ name: r2Buckets.drawings }),
        BOM_QUEUE: bindings.queue({ name: queues.bomFetch }),
        G3ID: bindings.worker({ worker: workerScriptName("g3id", mode) }),
        ONSHAPE_API_KEY: bindings.secret(),
        ONSHAPE_API_SECRET: bindings.secret(),
        ONSHAPE_COMPANY_ID: bindings.secret(),
        ONSHAPE_WEBHOOK_KEY_PRIMARY: bindings.secret(),
        ONSHAPE_WEBHOOK_KEY_SECONDARY: bindings.secret(),
        SLACK_BOT_TOKEN: bindings.secret(),
        SLACK_SIGNING_SECRET: bindings.secret(),
        PRINT_TOKEN: bindings.secret(),
      },
    },
  };
});
