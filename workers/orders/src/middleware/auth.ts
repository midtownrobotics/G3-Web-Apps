import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

type G3User = {
  id: string;
  displayName: string;
  /** Mentor flag from G3ID (always false on kiosk PIN sessions). */
  isMentor: boolean;
  /** Site admin flag from G3ID (always false on kiosk PIN sessions). Admins get mentor access here. */
  isAdmin: boolean;
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

/** Mentors and site admins approve, order, and manage budgets. */
function hasMentorAccess(user: G3User) {
  return user.isMentor === true || user.isAdmin === true;
}

function setUser(
  c: { set: <K extends keyof AppEnv["Variables"]>(key: K, value: AppEnv["Variables"][K]) => void },
  user: G3User,
) {
  c.set("userId", user.id);
  c.set("userDisplayName", user.displayName);
  c.set("userIsMentor", hasMentorAccess(user));
  c.set("userSlackId", user.identities?.find((i) => i.provider === "slack")?.providerId ?? null);
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = await loadUser(c);
  if (!user) return c.json({ error: "Unauthorized." }, 401);
  setUser(c, user);
  await next();
});

/** Mentors and site admins only: approving, ordering, and managing budget categories. */
export const requireMentor = createMiddleware<AppEnv>(async (c, next) => {
  const user = await loadUser(c);
  if (!user) return c.json({ error: "Unauthorized." }, 401);
  if (!hasMentorAccess(user)) return c.json({ error: "Mentor access required." }, 403);
  setUser(c, user);
  await next();
});

/** Whether this user may edit the catalog: mentors, and students mentors marked trusted. */
export async function canEditCatalog(c: {
  env: AppEnv["Bindings"];
  get: <K extends keyof AppEnv["Variables"]>(key: K) => AppEnv["Variables"][K];
}) {
  if (c.get("userIsMentor")) return true;
  const row = await c.env.ORDERS_DB.prepare("SELECT trusted FROM app_users WHERE id = ?")
    .bind(c.get("userId"))
    .first<{ trusted: number }>();
  return row?.trusted === 1;
}

/** Mentors and trusted students: adding categories and adding, editing or deleting parts. */
export const requireCatalogEditor = createMiddleware<AppEnv>(async (c, next) => {
  const user = await loadUser(c);
  if (!user) return c.json({ error: "Unauthorized." }, 401);
  setUser(c, user);
  if (!(await canEditCatalog(c))) {
    return c.json({ error: "Only mentors and trusted students can change the catalog." }, 403);
  }
  await next();
});
