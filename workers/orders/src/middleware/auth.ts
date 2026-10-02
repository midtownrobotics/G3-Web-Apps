import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

type G3User = {
  id: string;
  displayName: string;
  /** Mentor flag from G3ID (always false on kiosk PIN sessions). Admins aren't mentors by default. */
  isMentor: boolean;
  identities: { provider: string; providerId: string }[];
};

async function loadUser(c: {
  env: AppEnv["Bindings"];
  req: { header(name: string): string | undefined };
}) {
  const res = await c.env.G3ID.fetch(
    new Request("http://g3id/auth/me", { headers: { cookie: c.req.header("Cookie") ?? "" } }),
  );
  if (!res.ok) return null;
  return (await res.json()) as G3User;
}

function setUser(
  c: { set: <K extends keyof AppEnv["Variables"]>(key: K, value: AppEnv["Variables"][K]) => void },
  user: G3User,
) {
  c.set("userId", user.id);
  c.set("userDisplayName", user.displayName);
  c.set("userIsMentor", user.isMentor === true);
  c.set("userSlackId", user.identities?.find((i) => i.provider === "slack")?.providerId ?? null);
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = await loadUser(c);
  if (!user) return c.json({ error: "Unauthorized." }, 401);
  setUser(c, user);
  await next();
});

/** Mentors only: approving, ordering, and managing budget categories. */
export const requireMentor = createMiddleware<AppEnv>(async (c, next) => {
  const user = await loadUser(c);
  if (!user) return c.json({ error: "Unauthorized." }, 401);
  if (!user.isMentor) return c.json({ error: "Mentor access required." }, 403);
  setUser(c, user);
  await next();
});
