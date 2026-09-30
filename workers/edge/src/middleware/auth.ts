import { createMiddleware } from "hono/factory";
import { createEdgeDb } from "../db";
import { edgeStatus } from "../db/schema";
import type { AppEnv } from "../types";

async function loadUser(c: {
  env: AppEnv["Bindings"];
  req: { header(name: string): string | undefined };
}) {
  const res = await c.env.G3ID.fetch(
    new Request("http://g3id/auth/me?includeIdentities=false", {
      headers: { cookie: c.req.header("Cookie") ?? "" },
    }),
  );
  if (!res.ok) return null;
  return (await res.json()) as { id: string; displayName: string; isAdmin: boolean };
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = await loadUser(c);
  if (!user) return c.json({ error: "Unauthorized." }, 401);
  c.set("userId", user.id);
  c.set("userDisplayName", user.displayName);
  c.set("userIsAdmin", user.isAdmin);
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = await loadUser(c);
  if (!user) return c.json({ error: "Unauthorized." }, 401);
  if (!user.isAdmin) return c.json({ error: "Admin access required." }, 403);
  c.set("userId", user.id);
  c.set("userDisplayName", user.displayName);
  c.set("userIsAdmin", user.isAdmin);
  await next();
});

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

/** Constant-time comparison. Digests are compared so length doesn't leak either. */
async function keysMatch(expected: string, provided: string) {
  const [a, b] = await Promise.all([sha256(expected), sha256(provided)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Authenticates the edge agent by its shared key (Authorization: Bearer <key>).
 * Also records the agent's version and last-seen time, which is how the UI
 * knows whether the box is online.
 */
export const requireAgent = createMiddleware<AppEnv>(async (c, next) => {
  const key = c.env.EDGE_AGENT_KEY;
  const header = c.req.header("Authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!key || !provided || !(await keysMatch(key, provided)))
    return c.json({ error: "Unauthorized." }, 401);

  await next();

  const version = c.req.header("X-G3-Agent-Version");
  const startedAt = Number(c.req.header("X-G3-Agent-Started"));
  if (version && Number.isInteger(startedAt)) {
    const values = {
      agentVersion: version,
      agentStartedAt: startedAt,
      lastSeenAt: Math.floor(Date.now() / 1000),
    };
    c.executionCtx.waitUntil(
      createEdgeDb(c.env.EDGE_DB)
        .insert(edgeStatus)
        .values({ id: 1, ...values })
        .onConflictDoUpdate({ target: edgeStatus.id, set: values })
        .run(),
    );
  }
});
