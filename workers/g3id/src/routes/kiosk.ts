import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db";
import { kioskActivationCodes, kioskDevices } from "../db/schema";
import { requireKioskToken } from "../middleware/auth";
import type { AppEnv } from "../types";

function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const kioskRouter = new Hono<AppEnv>()
  .post("/kiosk/activate", async (c) => {
    let body: { code?: unknown; deviceName?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid request body." }, 400);
    }

    const code = typeof body.code === "string" ? body.code.trim() : "";
    const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim() : "";

    if (!code || !deviceName) {
      return c.json({ error: "Code and device name are required." }, 400);
    }

    const db = createDb(c.env.DB);
    const now = Math.floor(Date.now() / 1000);

    const activation = await db
      .select({ id: kioskActivationCodes.id, expiresAt: kioskActivationCodes.expiresAt, used: kioskActivationCodes.used })
      .from(kioskActivationCodes)
      .where(eq(kioskActivationCodes.code, code))
      .get();

    if (!activation) {
      return c.json({ error: "Invalid activation code." }, 400);
    }

    if (activation.used) {
      return c.json({ error: "Activation code already used." }, 400);
    }

    if (activation.expiresAt < now) {
      return c.json({ error: "Activation code expired." }, 400);
    }

    const token = generateToken();

    await db.batch([
      db.insert(kioskDevices).values({
        name: deviceName,
        token,
        createdBy: "system", // This will be set by the admin creating the code
        createdAt: now,
      }),
      db
        .update(kioskActivationCodes)
        .set({ used: 1 })
        .where(eq(kioskActivationCodes.id, activation.id)),
    ]);

    return c.json({ token });
  })
  .get("/kiosk/verify", requireKioskToken, async (c) => {
    const kioskDeviceId = c.get("kioskDeviceId");
    const db = createDb(c.env.DB);

    const device = await db
      .select({ name: kioskDevices.name, id: kioskDevices.id })
      .from(kioskDevices)
      .where(eq(kioskDevices.id, kioskDeviceId!))
      .get();

    if (!device) {
      return c.json({ error: "Device not found." }, 404);
    }

    return c.json({ valid: true, deviceId: device.id, deviceName: device.name });
  });
