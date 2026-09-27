import { workerUrl } from "@g3/config/client";
import type { G3IDApp } from "@g3/worker-g3id";
import { hc } from "hono/client";

export const g3id = hc<G3IDApp>(workerUrl("g3id"), { init: { credentials: "include" } });
