import { apiBase } from "@g3/config/client";
import type { ShopApp } from "@g3/worker-shop";
import { hc } from "hono/client";

export const api = hc<ShopApp>(apiBase("shop"), {
  init: { credentials: "include" },
});
