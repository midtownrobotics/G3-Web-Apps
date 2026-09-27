import { apiBase } from "@g3/config/client";
import type { G3IDApp } from "@g3/worker-g3id";
import { hc } from "hono/client";

export const api = hc<G3IDApp>(apiBase("g3id"), {
  init: { credentials: "include" },
});
