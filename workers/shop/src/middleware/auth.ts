import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const res = await c.env.G3ID.fetch(
    new Request("http://g3id/auth/me", {
      headers: { cookie: c.req.header("Cookie") ?? "" },
    }),
  );
  if (!res.ok) return c.json({ error: "Unauthorized." }, 401);
  const { id, isAdmin, email, displayName } = (await res.json()) as { id: string; isAdmin: boolean, email: string, displayName: string };
  c.set("userId", id);
  c.set("userIsAdmin", isAdmin);
  c.set("userEmail", email);
  c.set("userDisplayName", displayName);
  await next();
});
