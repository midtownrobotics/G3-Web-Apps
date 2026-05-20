import { Hono } from "hono";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { emailAuthRouter } from "./routes/auth/email";
import { githubAuthRouter } from "./routes/auth/github";
import { googleAuthRouter } from "./routes/auth/google";
import { slackAuthRouter } from "./routes/auth/slack";
import { slackRouter } from "./routes/slack";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error." }, 500);
});

import { cors } from 'hono/cors'

app.use('*', cors({
  origin: [
    'http://localhost:5173',
    'https://g3id.g3robotics.com',
    'https://*.g3id.pages.dev',  // ← covers your pages.dev preview URLs
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,  // ← required for cookies to work cross-origin
}));

app.get("/health", (c) => c.json({ status: "ok", service: "g3id" }));

app.route("/auth", authRouter);
app.route("/auth", emailAuthRouter);
app.route("/auth", githubAuthRouter);
app.route("/auth", googleAuthRouter);
app.route("/auth", slackAuthRouter);
app.route("/admin", adminRouter);
app.route("/slack", slackRouter);

export default app;
