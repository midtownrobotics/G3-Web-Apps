import { Hono } from "hono";
import { cors } from "hono/cors";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { emailAuthRouter } from "./routes/auth/email";
import { githubAuthRouter } from "./routes/auth/github";
import { googleAuthRouter } from "./routes/auth/google";
import { slackAuthRouter } from "./routes/auth/slack";
import { steamAuthRouter } from "./routes/auth/steam";
import { slackRouter } from "./routes/slack";
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
      if (origin.endsWith(".pages.dev")) return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ status: "ok", service: "g3id" }));

app.route("/auth", authRouter);
app.route("/auth", emailAuthRouter);
app.route("/auth", githubAuthRouter);
app.route("/auth", googleAuthRouter);
app.route("/auth", slackAuthRouter);
app.route("/auth", steamAuthRouter);
app.route("/admin", adminRouter);
app.route("/slack", slackRouter);

export default app;
