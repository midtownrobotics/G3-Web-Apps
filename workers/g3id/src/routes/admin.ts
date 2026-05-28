import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db";
import { coreSessions, coreSlackLinkCodes, coreUserIdentities, coreUsers } from "../db/schema";
import { requireAdmin } from "../middleware/auth";
import type { AppEnv } from "../types";

export const adminRouter = new Hono<AppEnv>()
  .use("*", requireAdmin)
  .get("/users", async (c) => {
    const db = createDb(c.env.DB);

    const [users, identities] = await Promise.all([
      db.select().from(coreUsers).orderBy(desc(coreUsers.createdAt)).all(),
      db
        .select({
          userId: coreUserIdentities.userId,
          provider: coreUserIdentities.provider,
          createdAt: coreUserIdentities.createdAt,
        })
        .from(coreUserIdentities)
        .all(),
    ]);

    const identitiesByUser = new Map<string, { provider: string; createdAt: number }[]>();
    for (const identity of identities) {
      const list = identitiesByUser.get(identity.userId) ?? [];
      list.push({ provider: identity.provider, createdAt: identity.createdAt });
      identitiesByUser.set(identity.userId, list);
    }

    return c.json(
      users.map((user) => ({
        ...user,
        identities: identitiesByUser.get(user.id) ?? [],
      })),
    );
  })
  .post("/users/:id/approve", async (c) => {
    const id = c.req.param("id");
    const db = createDb(c.env.DB);

    const user = await db
      .select({ id: coreUsers.id, status: coreUsers.status })
      .from(coreUsers)
      .where(eq(coreUsers.id, id))
      .get();

    if (!user) return c.json({ error: "User not found." }, 404);
    if (user.status !== "pending") return c.json({ error: "User is not pending." }, 400);

    await db
      .update(coreUsers)
      .set({ status: "active", updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(coreUsers.id, id));

    return c.json({ message: "User approved." });
  })
  .post("/users/:id/reject", async (c) => {
    const id = c.req.param("id");
    const db = createDb(c.env.DB);

    const user = await db
      .select({ id: coreUsers.id, status: coreUsers.status })
      .from(coreUsers)
      .where(eq(coreUsers.id, id))
      .get();

    if (!user) return c.json({ error: "User not found." }, 404);
    if (user.status !== "pending") return c.json({ error: "User is not pending." }, 400);

    await db
      .update(coreUsers)
      .set({ status: "rejected", updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(coreUsers.id, id));

    return c.json({ message: "User rejected." });
  })
  .post("/users/:id/merge", async (c) => {
    const id = c.req.param("id");

    let body: { targetUserId?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid request body." }, 400);
    }

    const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
    if (!targetUserId || targetUserId === id) {
      return c.json({ error: "Invalid target user." }, 400);
    }

    const db = createDb(c.env.DB);

    const [source, target] = await Promise.all([
      db
        .select({ id: coreUsers.id, status: coreUsers.status })
        .from(coreUsers)
        .where(eq(coreUsers.id, id))
        .get(),
      db
        .select({ id: coreUsers.id, status: coreUsers.status })
        .from(coreUsers)
        .where(eq(coreUsers.id, targetUserId))
        .get(),
    ]);

    if (!source) return c.json({ error: "User not found." }, 404);
    if (!target) return c.json({ error: "Target user not found." }, 404);
    if (source.status === "active") return c.json({ error: "Active users cannot be merged." }, 400);
    if (source.status === "merged") return c.json({ error: "User is already merged." }, 400);
    if (target.status === "merged")
      return c.json({ error: "Cannot merge into a merged user." }, 400);

    const [sourceIdentities, targetIdentities] = await Promise.all([
      db
        .select({ provider: coreUserIdentities.provider })
        .from(coreUserIdentities)
        .where(eq(coreUserIdentities.userId, id))
        .all(),
      db
        .select({ provider: coreUserIdentities.provider })
        .from(coreUserIdentities)
        .where(eq(coreUserIdentities.userId, targetUserId))
        .all(),
    ]);

    const targetProviders = new Set(targetIdentities.map((i) => i.provider));
    const conflict = sourceIdentities.find((i) => targetProviders.has(i.provider));
    if (conflict) {
      return c.json(
        { error: `Target user already has a ${conflict.provider} account. Cannot merge.` },
        409,
      );
    }

    const now = Math.floor(Date.now() / 1000);

    await db.batch([
      db
        .update(coreUserIdentities)
        .set({ userId: targetUserId, updatedAt: now })
        .where(eq(coreUserIdentities.userId, id)),
      db.update(coreSessions).set({ userId: targetUserId }).where(eq(coreSessions.userId, id)),
    ]);

    // Source user's identities and sessions are now on the target — delete the shell
    await db.delete(coreSlackLinkCodes).where(eq(coreSlackLinkCodes.userId, id));
    await db.delete(coreUsers).where(eq(coreUsers.id, id));

    return c.json({ message: "User merged." });
  })
  .delete("/users/:id", async (c) => {
    const id = c.req.param("id");
    const db = createDb(c.env.DB);

    const user = await db
      .select({ id: coreUsers.id, status: coreUsers.status })
      .from(coreUsers)
      .where(eq(coreUsers.id, id))
      .get();

    if (!user) return c.json({ error: "User not found." }, 404);
    if (user.status === "pending") {
      return c.json({ error: "Pending users must be rejected before deletion." }, 400);
    }

    await db.delete(coreSlackLinkCodes).where(eq(coreSlackLinkCodes.userId, id));
    await db.delete(coreSessions).where(eq(coreSessions.userId, id));
    await db.delete(coreUserIdentities).where(eq(coreUserIdentities.userId, id));
    await db.delete(coreUsers).where(eq(coreUsers.id, id));

    return c.json({ message: "User deleted." });
  })
  .post("/users/:id/promote", async (c) => {
    const id = c.req.param("id");
    const db = createDb(c.env.DB);

    const user = await db
      .select({ id: coreUsers.id })
      .from(coreUsers)
      .where(eq(coreUsers.id, id))
      .get();

    if (!user) return c.json({ error: "User not found." }, 404);

    await db
      .update(coreUsers)
      .set({ isAdmin: 1, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(coreUsers.id, id));

    return c.json({ message: "User promoted to admin." });
  })
  .post("/users/:id/demote", async (c) => {
    const id = c.req.param("id");
    const actorId = c.get("userId");
    if (id === actorId) return c.json({ error: "Cannot demote yourself." }, 400);

    const db = createDb(c.env.DB);

    const user = await db
      .select({ id: coreUsers.id })
      .from(coreUsers)
      .where(eq(coreUsers.id, id))
      .get();

    if (!user) return c.json({ error: "User not found." }, 404);

    await db
      .update(coreUsers)
      .set({ isAdmin: 0, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(coreUsers.id, id));

    return c.json({ message: "User demoted." });
  });
