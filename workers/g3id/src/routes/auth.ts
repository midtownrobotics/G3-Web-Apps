import { eq, inArray } from "drizzle-orm";
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
  // Resolve a batch of user IDs to public display names. Used by other services
  // (e.g. the shop worker) to show human names instead of raw IDs.
  .get("/users", requireAuth, async (c) => {
    const idsParam = c.req.query("ids") ?? "";
    const ids = [
      ...new Set(
        idsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    if (ids.length === 0) return c.json([] as { id: string; displayName: string }[]);

    const db = createDb(c.env.DB);
    const rows = await db
      .select({ id: coreUsers.id, displayName: coreUsers.displayName })
      .from(coreUsers)
      .where(inArray(coreUsers.id, ids))
      .all();

    return c.json(rows);
  })
  .post("/logout", async (c) => {
    const sessionId = getCookie(c, "g3_session");
    if (sessionId) await deleteSession(sessionId, c.env);
    deleteCookie(c, "g3_session", deleteCookieOptions(c.env.FRONTEND_URL));
    return c.json({ ok: true });
  });
