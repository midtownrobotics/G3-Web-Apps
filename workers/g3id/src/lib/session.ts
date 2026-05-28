import { eq } from "drizzle-orm";
import { createDb } from "../db";
import { coreSessions } from "../db/schema";
import type { AppEnv } from "../types";
import { newId } from "./id";

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export async function createSession(userId: string, env: AppEnv["Bindings"]): Promise<string> {
  const db = createDb(env.DB);
  const sessionId = newId();
  const now = Math.floor(Date.now() / 1000);

  await db.insert(coreSessions).values({
    id: sessionId,
    userId,
    expiresAt: now + SESSION_TTL,
    createdAt: now,
  });

  await env.SESSIONS.put(`session:${sessionId}`, userId, {
    expirationTtl: SESSION_TTL,
  });

  return sessionId;
}

export async function deleteSession(sessionId: string, env: AppEnv["Bindings"]): Promise<void> {
  const db = createDb(env.DB);
  await Promise.all([
    db.delete(coreSessions).where(eq(coreSessions.id, sessionId)),
    env.SESSIONS.delete(`session:${sessionId}`),
  ]);
}
