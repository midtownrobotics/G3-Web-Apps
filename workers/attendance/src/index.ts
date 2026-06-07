import { Hono } from "hono";
import { cors } from "hono/cors";
import { Firestore } from "./firestore";
import { requireAuth } from "./middleware/auth";
import { validateToken } from "./token";
import type { AppEnv } from "./types";

const AUTO_SIGNOUT_MS = 12 * 60 * 60 * 1000;

const base = new Hono<AppEnv>();

base.onError((err, c) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[attendance]", msg);
  return c.json({ error: msg }, 500);
});

base.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      if (origin === "https://g3robotics.com") return origin;
      if (origin.endsWith(".g3robotics.com")) return origin;
      if (origin.startsWith("http://localhost:")) return origin;
      if (origin.startsWith("http://127.0.0.1:")) return origin;
      if (origin.endsWith(".pages.dev")) return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

function db(env: AppEnv["Bindings"]) {
  return new Firestore(
    env.FIREBASE_PROJECT_ID,
    env.FIREBASE_CLIENT_EMAIL,
    env.FIREBASE_PRIVATE_KEY,
  );
}

// Firestore document key — the display-name slug joined with the G3ID id, so
// docs are both human-readable in the Firebase console and guaranteed unique
// (e.g. members/jane_doe_abc123). The full identity is also stored as fields.
function memberKey(displayName: string, userId: string): string {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  return slug ? `${slug}_${userId}` : userId;
}

const app = base
  .get("/health", (c) => c.json({ status: "ok", service: "attendance" }))

  // Who am I — used by the scanned page to show "Sign in as <name>".
  .get("/me", requireAuth, (c) =>
    c.json({
      id: c.get("userId"),
      displayName: c.get("userDisplayName"),
      email: c.get("userEmail"),
      isAdmin: c.get("userIsAdmin"),
    }),
  )

  // Sign in — identity from the G3ID session, presence from the kiosk token.
  .post("/signin", requireAuth, async (c) => {
    const { w } = await c.req.json<{ w: number }>();
    try {
      validateToken(w);
    } catch {
      return c.json({ error: "TOKEN_EXPIRED" }, 400);
    }

    const memberId = memberKey(c.get("userDisplayName"), c.get("userId"));
    const fs = db(c.env);
    const sessionsPath = `members/${memberId}/sessions`;

    await fs.setDoc(`members/${memberId}`, {
      displayName: c.get("userDisplayName"),
      email: c.get("userEmail"),
      userId: c.get("userId"),
    });

    const open = await fs.query(sessionsPath, [{ field: "status", op: "EQUAL", value: "open" }]);
    if (open.length > 0) return c.json({ error: "ALREADY_SIGNED_IN" }, 409);

    await fs.addDoc(sessionsPath, {
      signIn: new Date(),
      signOut: null,
      durationMs: null,
      status: "open",
      year: String(new Date().getFullYear()),
    });

    return c.json({ ok: true });
  })

  // Sign out — same identity/presence model.
  .post("/signout", requireAuth, async (c) => {
    const { w } = await c.req.json<{ w: number }>();
    try {
      validateToken(w);
    } catch {
      return c.json({ error: "TOKEN_EXPIRED" }, 400);
    }

    const memberId = memberKey(c.get("userDisplayName"), c.get("userId"));
    const fs = db(c.env);
    const sessionsPath = `members/${memberId}/sessions`;

    const open = await fs.query(sessionsPath, [{ field: "status", op: "EQUAL", value: "open" }]);
    if (!open.length) return c.json({ error: "NOT_SIGNED_IN" }, 404);

    const session = open[0];
    const signInRaw = session?.data?.signIn;
    const signInMs =
      signInRaw instanceof Date ? signInRaw.getTime() : new Date(signInRaw as string).getTime();
    const durationMs = Date.now() - signInMs;

    await fs.updateDoc(session.path, {
      signOut: new Date(),
      durationMs,
      status: "completed",
    });

    const year = String(new Date().getFullYear());
    const totalPath = `members/${memberId}/totals/${year}`;
    const existing = await fs.getDoc(totalPath);
    const prevMs = (existing?.data?.totalMs as number) ?? 0;
    const totalMs = prevMs + durationMs;

    await fs.setDoc(totalPath, {
      totalMs,
      totalHours: totalMs / 3_600_000,
      sessions: ((existing?.data?.sessions as number) ?? 0) + 1,
      year,
    });

    return c.json({ ok: true, durationMs, totalHours: totalMs / 3_600_000 });
  })

  // Who's currently signed in — any logged-in user can view.
  .get("/status", requireAuth, async (c) => {
    const fs = db(c.env);
    const open = await fs.collectionGroupQuery("sessions", [
      { field: "signOut", op: "EQUAL", value: null },
    ]);

    const signedIn = await Promise.all(
      open.map(async (s) => {
        const parts = s.path.split("/");
        const memberId = parts[1];
        if (!memberId) return "UNKNOWN";
        const member = await fs.getDoc(`members/${memberId}`);
        return (member?.data?.displayName as string) ?? memberId;
      }),
    );

    return c.json({ signedIn });
  });

async function autoSignOut(env: AppEnv["Bindings"]) {
  const fs = db(env);
  const cutoff = new Date(Date.now() - AUTO_SIGNOUT_MS);
  const stale = await fs.collectionGroupQuery("sessions", [
    { field: "signOut", op: "EQUAL", value: null },
    { field: "signIn", op: "LESS_THAN", value: cutoff },
  ]);

  await Promise.all(
    stale.map((session) =>
      fs.updateDoc(session.path, {
        signOut: new Date(),
        durationMs: null,
        status: "auto-closed",
      }),
    ),
  );
  console.log(`Auto-closed ${stale.length} sessions`);
}

export type AttendanceApp = typeof app;

export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledController, env: AppEnv["Bindings"], ctx: ExecutionContext) => {
    ctx.waitUntil(autoSignOut(env));
  },
};
