import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireAuth } from "./middleware/auth";
import { networkAgentRouter, networkRouter, networkScheduled } from "./modules/network";
import { statusRouter } from "./routes/status";
import type { AppEnv } from "./types";

const base = new Hono<AppEnv>();

base.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error." }, 500);
});

base.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      if (origin === "https://g3robotics.com") return origin;
      if (origin.endsWith(".g3robotics.com")) return origin;
      if (origin.startsWith("http://localhost:")) return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  }),
);

const app = base
  .get("/health", (c) => c.json({ status: "ok", service: "edge", version: "v0.1.0" }))
  .get("/me", requireAuth, (c) =>
    c.json({
      userId: c.get("userId"),
      displayName: c.get("userDisplayName"),
      isAdmin: c.get("userIsAdmin"),
    }),
  )
  .route("/status", statusRouter)
  .route("/network", networkRouter)
  // Agent-facing routes (shared-key auth), one prefix per module.
  .route("/agent/network", networkAgentRouter);

export type EdgeApp = typeof app;

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: AppEnv["Bindings"]) {
    await networkScheduled(env);
  },
};
