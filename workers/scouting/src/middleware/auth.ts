import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const response = await c.env.G3ID.fetch(
    new Request("http://g3id/auth/me", {
      headers: { cookie: c.req.header("Cookie") ?? "" },
    }),
  );
  if (!response.ok) return c.json({ error: "Unauthorized." }, 401);

  const user = (await response.json()) as {
    id: string;
    displayName: string;
    email: string;
    isAdmin: boolean;
  };
  c.set("userId", user.id);
  c.set("userDisplayName", user.displayName);
  c.set("userEmail", user.email);
  c.set("userIsAdmin", user.isAdmin);
  await next();
});
