import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireAuth } from "./middleware/auth";
import { onshapeWebhooksRouter } from "./routes/onshape-webhooks";
import { partDefinitionsRouter } from "./routes/part-definitions";
import { partInstanceProcessesRouter } from "./routes/part-instance-processes";
import { partInstancesRouter } from "./routes/part-instances";
import { processesRouter } from "./routes/processes";
import { subsystemsRouter } from "./routes/subsystems";
import { sendMessage } from "@g3/slack";
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
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

const app = base
  .get("/health", (c) => c.json({ status: "ok", service: "shop" }))
  .get("/me", requireAuth, (c) =>
    c.json({
      userId: c.get("userId"),
      isAdmin: c.get("userIsAdmin"),
      email: c.get("userEmail"),
      displayName: c.get("userDisplayName"),
    }),
  )
  .route("/onshape", onshapeWebhooksRouter)
  .route("/subsystems", subsystemsRouter)
  .route("/processes", processesRouter)
  .route("/part-definitions", partDefinitionsRouter)
  .route("/part-instances", partInstancesRouter)
  .route("/part-instance-processes", partInstanceProcessesRouter)
  .get("/slack-test", async (c) => {
    c.executionCtx.waitUntil(
      sendMessage("C09QYMTSGKT", "test but now from shop sw worker", c.env)
    )
    return c.text("200", 200);
  });

export type ShopApp = typeof app;
export default app;
