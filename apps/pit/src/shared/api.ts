import type { PitApp } from "@g3/worker-pit";
import { hc } from "hono/client";

export const api = hc<PitApp>(import.meta.env.VITE_API_BASE_URL ?? "", {
  init: { credentials: "include" },
});
