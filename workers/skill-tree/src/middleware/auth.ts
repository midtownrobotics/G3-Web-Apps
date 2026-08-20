import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const res = await c.env.G3ID.fetch(
    new Request("http://g3id/auth/me", {
      headers: { cookie: c.req.header("Cookie") ?? "" },
    }),
  );
  if (!res.ok) return c.json({ error: "Unauthorized." }, 401);
  const { id, isAdmin, isMentor, email, displayName, sessionType } = (await res.json()) as {
    id: string;
    isAdmin: boolean;
    isMentor: boolean;
    email: string;
    displayName: string;
    sessionType: "oauth" | "pin";
  };
  c.set("userId", id);
  c.set("userIsAdmin", isAdmin);
  c.set("userIsMentor", isMentor);
  c.set("userEmail", email);
  c.set("userDisplayName", displayName);
  c.set("sessionType", sessionType);
  await next();
});

export const requireOAuthSession = createMiddleware<AppEnv>(async (c, next) => {
  const sessionType = c.get("sessionType") as string | undefined;
  if (sessionType === "pin") {
    return c.json({ error: "Mentor actions not allowed from kiosk mode." }, 403);
  }
  await next();
});
