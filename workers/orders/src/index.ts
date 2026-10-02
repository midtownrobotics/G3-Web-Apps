import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireAuth } from "./middleware/auth";
import { categoriesRouter } from "./routes/categories";
import { lookupRouter } from "./routes/lookup";
import { ordersRouter } from "./routes/orders";
import { requestsRouter } from "./routes/requests";
import { vendorsRouter } from "./routes/vendors";
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
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  }),
);

const app = base
  .get("/health", (c) => c.json({ status: "ok", service: "orders", version: "v0.1.0" }))
  .get("/me", requireAuth, (c) =>
    c.json({
      userId: c.get("userId"),
      displayName: c.get("userDisplayName"),
      isMentor: c.get("userIsMentor"),
    }),
  )
  .route("/lookup", lookupRouter)
  .route("/categories", categoriesRouter)
  .route("/requests", requestsRouter)
  .route("/orders", ordersRouter)
  .route("/vendors", vendorsRouter);

export type OrdersApp = typeof app;
export type { ImportSummary } from "./lib/sheet-import";

export default { fetch: app.fetch };
