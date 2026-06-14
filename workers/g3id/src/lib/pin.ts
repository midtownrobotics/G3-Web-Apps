import { eq } from "drizzle-orm";
import { createDb } from "../db";
import { coreUserPins } from "../db/schema";
import type { AppEnv } from "../types";

function generateRandomPin(): string {
  const num = crypto.getRandomValues(new Uint32Array(1))[0] % 1000;
  return num.toString().padStart(3, "0");
}

export async function generateUniquePin(env: AppEnv["Bindings"]): Promise<string> {
  const db = createDb(env.DB);
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const pin = generateRandomPin();
    const existing = await db
      .select({ id: coreUserPins.id })
      .from(coreUserPins)
      .where(eq(coreUserPins.pin, pin))
      .get();

    if (!existing) {
      return pin;
    }
    attempts++;
  }

  throw new Error("Failed to generate unique PIN after 10 attempts");
}

export async function generatePinForUser(userId: string, env: AppEnv["Bindings"]): Promise<string> {
  const pin = await generateUniquePin(env);
  const now = Math.floor(Date.now() / 1000);
  const db = createDb(env.DB);

  await db.insert(coreUserPins).values({
    userId,
    pin,
    createdAt: now,
    updatedAt: now,
  });

  return pin;
}

export async function regeneratePinForUser(
  userId: string,
  env: AppEnv["Bindings"],
): Promise<string> {
  const pin = await generateUniquePin(env);
  const now = Math.floor(Date.now() / 1000);
  const db = createDb(env.DB);

  const existing = await db
    .select({ id: coreUserPins.id })
    .from(coreUserPins)
    .where(eq(coreUserPins.userId, userId))
    .get();

  if (existing) {
    await db
      .update(coreUserPins)
      .set({ pin, updatedAt: now })
      .where(eq(coreUserPins.userId, userId));
  } else {
    await db.insert(coreUserPins).values({
      userId,
      pin,
      createdAt: now,
      updatedAt: now,
    });
  }

  return pin;
}
