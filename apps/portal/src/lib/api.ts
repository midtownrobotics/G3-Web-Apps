import type { G3IDApp } from "@g3/worker-g3id";
import { hc } from "hono/client";

export const g3id = hc<G3IDApp>(
  import.meta.env.VITE_G3ID_API_URL ?? "https://api.g3id.g3robotics.com",
  { init: { credentials: "include" } },
);
