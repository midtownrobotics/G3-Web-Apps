import type { ShopApp } from "@g3/worker-shop";
import { hc } from "hono/client";

export const api = hc<ShopApp>(import.meta.env.VITE_API_BASE_URL ?? "", {
  init: { credentials: "include" },
});
