import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { createDb } from "../db";
import { coreUserIdentities, coreUsers } from "../db/schema";
import { deleteCookieOptions } from "../lib/cookie";
import { deleteSession } from "../lib/session";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const authRouter = new Hono<AppEnv>()
  .get("/me", requireAuth, async (c) => {
    const userId = c.get("userId");
    const db = createDb(c.env.DB);

    const user = await db
      .select({
        id: coreUsers.id,
        email: coreUsers.email,
        displayName: coreUsers.displayName,
        status: coreUsers.status,
        isAdmin: coreUsers.isAdmin,
        createdAt: coreUsers.createdAt,
      })
      .from(coreUsers)
      .where(eq(coreUsers.id, userId))
      .get();

    if (!user) return c.json({ error: "User not found." }, 404);

    const identities = await db
      .select({ provider: coreUserIdentities.provider, createdAt: coreUserIdentities.createdAt })
      .from(coreUserIdentities)
      .where(eq(coreUserIdentities.userId, userId))
      .all();

    return c.json({ ...user, identities });
  })
  .post("/logout", async (c) => {
    const sessionId = getCookie(c, "g3_session");
    if (sessionId) await deleteSession(sessionId, c.env);
    deleteCookie(c, "g3_session", deleteCookieOptions(c.env.FRONTEND_URL));
    return c.json({ ok: true });
  });
