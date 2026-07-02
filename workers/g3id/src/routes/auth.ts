import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { createDb } from "../db";
import { coreUserIdentities, coreUserPins, coreUsers } from "../db/schema";
import { deleteCookieOptions } from "../lib/cookie";
import { regeneratePinForUser } from "../lib/pin";
import { deleteSession } from "../lib/session";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const authRouter = new Hono<AppEnv>()
  .get("/me", requireAuth, async (c) => {
    const userId = c.get("userId") as string;
    const sessionId = getCookie(c, "g3_session");
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

    let sessionType: "oauth" | "pin" = "oauth";
    let kioskDeviceId: number | undefined;

    if (sessionId) {
      const sessionData = await c.env.SESSIONS.get(sessionId);
      if (sessionData) {
        try {
          const parsed = JSON.parse(sessionData) as {
            sessionType?: string;
            kioskDeviceId?: number;
          };
          if (parsed.sessionType === "pin") {
            sessionType = "pin";
            kioskDeviceId = parsed.kioskDeviceId;
          }
        } catch {
          // Session data is not JSON, treat as oauth
        }
      }
    }

    const isAdmin = sessionType === "pin" ? false : user.isAdmin === 1;

    return c.json({
      ...user,
      identities,
      isAdmin,
      sessionType,
      ...(kioskDeviceId && { kioskDeviceId }),
    });
  })
  .post("/logout", async (c) => {
    const sessionId = getCookie(c, "g3_session");
    let isKiosk = false;

    if (sessionId) {
      const sessionData = await c.env.SESSIONS.get(sessionId);
      if (sessionData) {
        try {
          const parsed = JSON.parse(sessionData) as { sessionType?: string };
          if (parsed.sessionType === "pin") {
            isKiosk = true;
          }
        } catch {
          // Continue with logout
        }
      }
      await deleteSession(sessionId, c.env);
    }

    deleteCookie(c, "g3_session", deleteCookieOptions(c.env.FRONTEND_URL));
    return c.json({ ok: true, isKiosk });
  })
  .get("/pin/me", requireAuth, async (c) => {
    const userId = c.get("userId") as string;
    const sessionId = getCookie(c, "g3_session");
    const db = createDb(c.env.DB);

    if (sessionId) {
      const sessionData = await c.env.SESSIONS.get(sessionId);
      if (sessionData) {
        try {
          const parsed = JSON.parse(sessionData) as { sessionType?: string };
          if (parsed.sessionType === "pin") {
            return c.json({ error: "PIN sessions cannot view PINs." }, 403);
          }
        } catch {
          // Continue
        }
      }
    }

    const userPin = await db
      .select({ pin: coreUserPins.pin })
      .from(coreUserPins)
      .where(eq(coreUserPins.userId, userId))
      .get();

    if (!userPin) {
      return c.json({ error: "No PIN found." }, 404);
    }

    return c.json({ pin: userPin.pin });
  })
  .post("/pin/regenerate", requireAuth, async (c) => {
    const userId = c.get("userId") as string;
    const sessionId = getCookie(c, "g3_session");

    if (sessionId) {
      const sessionData = await c.env.SESSIONS.get(sessionId);
      if (sessionData) {
        try {
          const parsed = JSON.parse(sessionData) as { sessionType?: string };
          if (parsed.sessionType === "pin") {
            return c.json({ error: "PIN sessions cannot regenerate PINs." }, 403);
          }
        } catch {
          // Continue
        }
      }
    }

    const newPin = await regeneratePinForUser(userId, c.env);

    // TODO: Send PIN via Slack DM or email

    return c.json({ pin: newPin });
  });
