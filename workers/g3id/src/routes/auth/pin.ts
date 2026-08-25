import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { createDb } from "../../db";
import { coreUserPins, coreUsers } from "../../db/schema";
import { sessionCookieOptions } from "../../lib/cookie";
import { createSession } from "../../lib/session";
import { requireKioskToken } from "../../middleware/auth";
import type { AppEnv } from "../../types";

export const pinAuthRouter = new Hono<AppEnv>().post("/pin", requireKioskToken, async (c) => {
  let body: { pin?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body." }, 400);
  }

  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!pin) {
    return c.json({ error: "PIN is required." }, 400);
  }

  const db = createDb(c.env.DB);
  const kioskDeviceId = c.get("kioskDeviceId");

  const userPin = await db
    .select({ userId: coreUserPins.userId })
    .from(coreUserPins)
    .where(eq(coreUserPins.pin, pin))
    .get();

  if (!userPin) {
    return c.json({ error: "Invalid PIN." }, 400);
  }

  const user = await db
    .select({ status: coreUsers.status })
    .from(coreUsers)
    .where(eq(coreUsers.id, userPin.userId))
    .get();

  if (!user || user.status !== "active") {
    return c.json({ error: "User account is not active." }, 403);
  }

  const sessionId = await createSession(userPin.userId, c.env);
  const sessionData = JSON.stringify({
    sessionType: "pin",
    kioskDeviceId,
  });
  await c.env.SESSIONS.put(`session:${sessionId}`, sessionData, { expirationTtl: 7 * 24 * 60 * 60 });

  setCookie(c, "g3_session", sessionId, sessionCookieOptions(c.env.FRONTEND_URL));

  return c.json({ success: true });
});
