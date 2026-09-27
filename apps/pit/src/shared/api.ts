import { apiBase } from "@g3/config/client";
import type { PitApp } from "@g3/worker-pit";
import { hc } from "hono/client";

export const api = hc<PitApp>(apiBase("pit"), {
  init: { credentials: "include" },
});
