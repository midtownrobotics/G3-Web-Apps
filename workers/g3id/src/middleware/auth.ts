import { resolveUserId } from "@g3/auth";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { createDb } from "../db";
import { coreUsers } from "../db/schema";
import type { AppEnv } from "../types";

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
