import { eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { createDb } from "../db";
import { coreUsers } from "../db/schema";
import { getSession } from "../lib/session";
import type { AppEnv } from "../types";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const sessionId = getCookie(c, "g3_session");
  if (!sessionId) return c.json({ error: "Unauthorized." }, 401);

  const userId = await getSession(sessionId, c.env);
  if (!userId) return c.json({ error: "Unauthorized." }, 401);

  c.set("userId", userId);
  await next();
});

export const requireActive = createMiddleware<AppEnv>(async (c, next) => {
  const sessionId = getCookie(c, "g3_session");
  if (!sessionId) return c.json({ error: "Unauthorized." }, 401);

  const userId = await getSession(sessionId, c.env);
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
