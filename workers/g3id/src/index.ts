import { Hono } from "hono";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { emailAuthRouter } from "./routes/auth/email";
import { githubAuthRouter } from "./routes/auth/github";
import { googleAuthRouter } from "./routes/auth/google";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error." }, 500);
});

app.get("/health", (c) => c.json({ status: "ok", service: "g3id" }));

app.route("/auth", authRouter);
app.route("/auth", emailAuthRouter);
app.route("/auth", githubAuthRouter);
app.route("/auth", googleAuthRouter);
app.route("/admin", adminRouter);

export default app;
