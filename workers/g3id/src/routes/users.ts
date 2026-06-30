import { eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db";
import { coreUserPins, coreUsers } from "../db/schema";
import { requireAdmin, requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export type BasicUserInfo = {
  id: string;
  email: string;
  displayName: string;
  status: "pending" | "active" | "rejected" | "merged";
  isAdmin: boolean;
  createdAt: number;
  lastLoginAt: number | null;
};

export type UserWithPin = BasicUserInfo & {
  pin: string;
};

export const usersRouter = new Hono<AppEnv>()
  .get("/", requireAdmin, async (c) => {
    const db = createDb(c.env.DB);

    const users = await db
      .select({
        id: coreUsers.id,
        email: coreUsers.email,
        displayName: coreUsers.displayName,
        status: coreUsers.status,
        isAdmin: coreUsers.isAdmin,
        createdAt: coreUsers.createdAt,
        lastLoginAt: coreUsers.lastLoginAt,
      })
      .from(coreUsers)
      .where(isNull(coreUsers.deletedAt))
      .all();

    const basicUsers: BasicUserInfo[] = users.map((user) => ({
      ...user,
      isAdmin: user.isAdmin === 1,
      status: user.status as "pending" | "active" | "rejected" | "merged",
    }));

    return c.json(basicUsers);
  })
  .get("/by-pin/:pin", requireAuth, async (c) => {
    const pin = c.req.param("pin");
    const db = createDb(c.env.DB);

    const userPin = await db
      .select({ userId: coreUserPins.userId })
      .from(coreUserPins)
      .where(eq(coreUserPins.pin, pin))
      .get();

    if (!userPin) {
      return c.json({ error: "User not found for this PIN." }, 404);
    }

    const user = await db
      .select({
        id: coreUsers.id,
        email: coreUsers.email,
        displayName: coreUsers.displayName,
        status: coreUsers.status,
        isAdmin: coreUsers.isAdmin,
        createdAt: coreUsers.createdAt,
        lastLoginAt: coreUsers.lastLoginAt,
      })
      .from(coreUsers)
      .where(eq(coreUsers.id, userPin.userId))
      .get();

    if (!user) {
      return c.json({ error: "User not found." }, 404);
    }

    const result: UserWithPin = {
      ...user,
      pin,
      isAdmin: user.isAdmin === 1,
      status: user.status as "pending" | "active" | "rejected" | "merged",
    };

    return c.json(result);
  });
