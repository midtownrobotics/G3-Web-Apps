import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { createDb } from "../../db";
import { coreUserIdentities, coreUsers } from "../../db/schema";
import { newId } from "../../lib/id";
import { hashPassword, verifyPassword } from "../../lib/password";
import { createSession } from "../../lib/session";
import { requireAuth } from "../../middleware/auth";
import type { AppEnv } from "../../types";

export const emailAuthRouter = new Hono<AppEnv>();

emailAuthRouter.post("/signup/email", async (c) => {
  let body: { name?: unknown; email?: unknown; password?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body." }, 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!name || !email || !password) {
    return c.json({ error: "Name, email, and password are required." }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters." }, 400);
  }

  const db = createDb(c.env.DB);

  const existing = await db
    .select({ id: coreUsers.id })
    .from(coreUsers)
    .where(eq(coreUsers.email, email))
    .get();

  if (existing) {
    return c.json({ error: "An account with that email already exists." }, 409);
  }

  const now = Math.floor(Date.now() / 1000);
  const userId = newId();
  const passwordHash = await hashPassword(password);

  await db.batch([
    db.insert(coreUsers).values({
      id: userId,
      email,
      displayName: name,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(coreUserIdentities).values({
      id: newId(),
      userId,
      provider: "local",
      passwordHash,
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  return c.json(
    { message: "Account created. You'll be notified when your account is approved." },
    201,
  );
});

emailAuthRouter.post("/login/email", async (c) => {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body." }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return c.json({ error: "Email and password are required." }, 400);
  }

  const db = createDb(c.env.DB);
  const invalidError = { error: "Invalid email or password." };

  const user = await db
    .select({ id: coreUsers.id, status: coreUsers.status })
    .from(coreUsers)
    .where(eq(coreUsers.email, email))
    .get();

  if (!user) return c.json(invalidError, 401);

  const identity = await db
    .select({ passwordHash: coreUserIdentities.passwordHash })
    .from(coreUserIdentities)
    .where(and(eq(coreUserIdentities.userId, user.id), eq(coreUserIdentities.provider, "local")))
    .get();

  if (!identity?.passwordHash) return c.json(invalidError, 401);

  const valid = await verifyPassword(password, identity.passwordHash);
  if (!valid) return c.json(invalidError, 401);

  if (user.status === "pending") {
    return c.json({ error: "Your account is awaiting admin approval." }, 403);
  }
  if (user.status !== "active") {
    return c.json({ error: "Your account is not active." }, 403);
  }

  const sessionId = await createSession(user.id, c.env);
  setCookie(c, "g3_session", sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax" as const,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return c.json({ ok: true });
});

emailAuthRouter.post("/password", requireAuth, async (c) => {
  let body: { password?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body." }, 400);
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters." }, 400);
  }

  const userId = c.get("userId");
  const db = createDb(c.env.DB);

  const existing = await db
    .select({ id: coreUserIdentities.id })
    .from(coreUserIdentities)
    .where(and(eq(coreUserIdentities.userId, userId), eq(coreUserIdentities.provider, "local")))
    .get();

  if (existing) {
    return c.json({ error: "A password is already set on this account." }, 409);
  }

  const now = Math.floor(Date.now() / 1000);
  const passwordHash = await hashPassword(password);

  await db.insert(coreUserIdentities).values({
    id: newId(),
    userId,
    provider: "local",
    passwordHash,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ ok: true });
});
