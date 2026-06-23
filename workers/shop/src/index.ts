import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireAuth } from "./middleware/auth";
import { partDefinitionsRouter } from "./routes/part-definitions";
import { partInstanceProcessesRouter } from "./routes/part-instance-processes";
import { partInstancesRouter } from "./routes/part-instances";
import { processesRouter } from "./routes/processes";
import { subsystemsRouter } from "./routes/subsystems";
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
  // Resolve user IDs (e.g. part creators) to display names via g3id.
  .get("/users", requireAuth, async (c) => {
    const ids = c.req.query("ids") ?? "";
    const res = await c.env.G3ID.fetch(
      new Request(`http://g3id/auth/users?ids=${encodeURIComponent(ids)}`, {
        headers: { cookie: c.req.header("Cookie") ?? "" },
      }),
    );
    if (!res.ok) return c.json({ error: "Failed to resolve users." }, 502);
    return c.json((await res.json()) as { id: string; displayName: string }[]);
  })
  .route("/subsystems", subsystemsRouter)
  .route("/processes", processesRouter)
  .route("/part-definitions", partDefinitionsRouter)
  .route("/part-instances", partInstancesRouter)
  .route("/part-instance-processes", partInstanceProcessesRouter);

export type ShopApp = typeof app;
export default app;
