import { Hono } from "hono";

type Env = {
  Bindings: {
    DB: D1Database;
    SESSIONS: KVNamespace;
    RATE_LIMIT: KVNamespace;
  };
};

const app = new Hono<Env>();

app.get("/health", (c) => c.json({ status: "ok", service: "g3id" }));
app.get("/hello", (c) => c.json({ res: "world" }));


export default app;
