import { Hono } from "hono";
import type { EdgeModule } from "./module";
import { AGENT_VERSION } from "./version";

/** Local HTTP API. Bound to 127.0.0.1 only; cloudflared is the only way in (Phase 2). */
export function startServer(port: number, modules: EdgeModule[], startedAt: number) {
  const app = new Hono().get("/health", (c) =>
    c.json({
      version: AGENT_VERSION,
      startedAt,
      uptimeSeconds: Math.floor(Date.now() / 1000) - startedAt,
      modules: Object.fromEntries(modules.map((m) => [m.name, m.status()])),
    }),
  );
  for (const m of modules) {
    if (m.routes) app.route(`/${m.name}`, m.routes);
  }
  return Bun.serve({ hostname: "127.0.0.1", port, fetch: app.fetch });
}
