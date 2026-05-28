import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireAuth } from "./middleware/auth";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error." }, 500);
});

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      if (origin === "https://g3robotics.com") return origin;
      if (origin.endsWith(".g3robotics.com")) return origin;
      if (origin.startsWith("http://localhost:")) return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ status: "ok", service: "shop" }));

app.get("/me", requireAuth, (c) =>
  c.json({ userId: c.get("userId"), isAdmin: c.get("userIsAdmin"), email: c.get("userEmail"), displayName: c.get("userDisplayName") }),
);

export default app;
