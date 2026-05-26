import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { createDb } from "../db";
import { coreUsers } from "../db/schema";
import { getSession } from "../lib/session";
import type { AppEnv } from "../types";

function getSessionIds(cookieHeader: string): string[] {
  return cookieHeader
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.startsWith("g3_session="))
    .map((p) => p.slice("g3_session=".length))
    .filter(Boolean);
}

async function resolveUserId(
  cookieHeader: string,
  env: AppEnv["Bindings"],
): Promise<string | null> {
  for (const id of getSessionIds(cookieHeader)) {
    const userId = await getSession(id, env);
    if (userId) return userId;
  }
  return null;
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const userId = await resolveUserId(c.req.header("Cookie") ?? "", c.env);
  if (!userId) return c.json({ error: "Unauthorized." }, 401);
  c.set("userId", userId);
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const userId = await resolveUserId(c.req.header("Cookie") ?? "", c.env);
  if (!userId) return c.json({ error: "Unauthorized." }, 401);

  const db = createDb(c.env.DB);
  const user = await db
    .select({ status: coreUsers.status, isAdmin: coreUsers.isAdmin })
    .from(coreUsers)
    .where(eq(coreUsers.id, userId))
    .get();

  if (!user || user.status !== "active" || !user.isAdmin) {
    return c.json({ error: "Forbidden." }, 403);
  }

  c.set("userId", userId);
  await next();
});

export const requireActive = createMiddleware<AppEnv>(async (c, next) => {
  const userId = await resolveUserId(c.req.header("Cookie") ?? "", c.env);
  if (!userId) return c.json({ error: "Unauthorized." }, 401);

  const db = createDb(c.env.DB);
  const user = await db
    .select({ status: coreUsers.status })
    .from(coreUsers)
    .where(eq(coreUsers.id, userId))
    .get();

  if (!user || user.status !== "active") return c.json({ error: "Forbidden." }, 403);

  c.set("userId", userId);
  await next();
});
