import { Hono } from "hono";
import { cors } from "hono/cors";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { emailAuthRouter } from "./routes/auth/email";
import { githubAuthRouter } from "./routes/auth/github";
import { googleAuthRouter } from "./routes/auth/google";
import { pinAuthRouter } from "./routes/auth/pin";
import { slackAuthRouter } from "./routes/auth/slack";
import { steamAuthRouter } from "./routes/auth/steam";
import { kioskRouter } from "./routes/kiosk";
import { slackRouter } from "./routes/slack";
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
      if (origin.endsWith(".pages.dev")) return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

const app = base
  .get("/health", (c) => c.json({ status: "ok", service: "g3id" }))
  .route("/auth", authRouter)
  .route("/auth", emailAuthRouter)
  .route("/auth", githubAuthRouter)
  .route("/auth", googleAuthRouter)
  .route("/auth", pinAuthRouter)
  .route("/auth", slackAuthRouter)
  .route("/auth", steamAuthRouter)
  .route("/admin", adminRouter)
  .route("/", kioskRouter)
  .route("/slack", slackRouter);

export type G3IDApp = typeof app;
export default app;
