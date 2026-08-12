import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const res = await c.env.G3ID.fetch(
    new Request("http://g3id/auth/me", {
      headers: { cookie: c.req.header("Cookie") ?? "" },
    }),
  );
  if (!res.ok) return c.json({ error: "Unauthorized." }, 401);
  const { id, isAdmin, email, displayName, sessionType, kioskDeviceId, kioskDeviceName } =
    (await res.json()) as {
      id: string;
      isAdmin: boolean;
      email: string;
      displayName: string;
      sessionType?: "oauth" | "pin";
      kioskDeviceId?: number;
      kioskDeviceName?: string;
    };
  c.set("userId", id);
  c.set("userIsAdmin", isAdmin);
  c.set("userEmail", email);
  c.set("userDisplayName", displayName);
  c.set("sessionType", sessionType ?? "oauth");
  c.set("kioskDeviceId", kioskDeviceId ?? null);
  c.set("kioskDeviceName", kioskDeviceName ?? null);
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const res = await c.env.G3ID.fetch(
    new Request("http://g3id/auth/me", {
      headers: { cookie: c.req.header("Cookie") ?? "" },
    }),
  );
  if (!res.ok) return c.json({ error: "Unauthorized." }, 401);
  const { id, isAdmin, email, displayName, sessionType, kioskDeviceId, kioskDeviceName } =
    (await res.json()) as {
      id: string;
      isAdmin: boolean;
      email: string;
      displayName: string;
      sessionType?: "oauth" | "pin";
      kioskDeviceId?: number;
      kioskDeviceName?: string;
    };
  if (!isAdmin) return c.json({ error: "Admin access required." }, 403);
  c.set("userId", id);
  c.set("userIsAdmin", isAdmin);
  c.set("userEmail", email);
  c.set("userDisplayName", displayName);
  c.set("sessionType", sessionType ?? "oauth");
  c.set("kioskDeviceId", kioskDeviceId ?? null);
  c.set("kioskDeviceName", kioskDeviceName ?? null);
  await next();
});
