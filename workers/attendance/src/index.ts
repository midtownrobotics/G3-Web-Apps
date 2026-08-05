import { Hono } from "hono";
import { cors } from "hono/cors";
import { Firestore } from "./firestore";
import { requireAuth } from "./middleware/auth";
import { currentWindow, validateToken } from "./token";
import type { AppEnv } from "./types";

const AUTO_SIGNOUT_MS = 12 * 60 * 60 * 1000;
const SCHOOL_YEAR_START_MONTH = 7; // August (zero-based)
const SCHOOL_YEAR_START_DAY = 3;

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

async function listOpenSessions(fs: Firestore) {
  const members = await fs.listCollection("members");
  const nested = await Promise.all(
    members.map(async (member) => {
      const sessions = await fs.listCollection(`members/${member.id}/sessions`);
      return sessions
        .filter((session) => session.data.status === "open")
        .map((session) => ({ session, member }));
    }),
  );
  return nested.flat();
}

function schoolYear(date: Date): string {
  const startsThisYear =
    date.getMonth() > SCHOOL_YEAR_START_MONTH ||
    (date.getMonth() === SCHOOL_YEAR_START_MONTH && date.getDate() >= SCHOOL_YEAR_START_DAY);
  const start = startsThisYear ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

async function calculateSchoolYearTotals(fs: Firestore, memberId: string, year: string) {
  const sessions = await fs.listCollection(`members/${memberId}/sessions`);
  let totalMs = 0;
  let completedSessions = 0;
  for (const session of sessions) {
    const raw = session.data.signIn;
    const signIn = raw instanceof Date ? raw : new Date(raw as string);
    if (Number.isNaN(signIn.getTime()) || schoolYear(signIn) !== year) continue;
    const duration = session.data.durationMs;
    // Auto-closed sessions are invalid and never count toward attendance,
    // including records created before this rule stored a zero duration.
    if (session.data.status === "auto-closed") {
      completedSessions++;
      continue;
    }
    if (typeof duration === "number" && Number.isFinite(duration)) {
      totalMs += Math.max(0, duration);
      completedSessions++;
    }
  }
  return { totalMs, completedSessions };
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

  // Current kiosk code — admin only. The kiosk display fetches this to build its
  // QR, so the live presence token is never issued to non-admins.
  .get("/code", requireAuth, (c) => {
    if (!c.get("userIsAdmin")) return c.json({ error: "Forbidden." }, 403);
    return c.json({ w: currentWindow() });
  })

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
    await autoSignOut(c.env);

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
      year: schoolYear(new Date()),
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
    if (!Number.isFinite(signInMs)) {
      return c.json({ error: "INVALID_SESSION" }, 500);
    }
    const elapsedMs = Date.now() - signInMs;
    const timedOut = elapsedMs >= AUTO_SIGNOUT_MS;
    const durationMs = timedOut ? 0 : Math.max(0, elapsedMs);

    await fs.updateDoc(session.path, {
      signOut: timedOut ? new Date(signInMs + AUTO_SIGNOUT_MS) : new Date(),
      durationMs,
      status: timedOut ? "auto-closed" : "completed",
    });

    const year = schoolYear(new Date(signInMs));
    const totalPath = `members/${memberId}/totals/${year}`;
    const { totalMs, completedSessions } = await calculateSchoolYearTotals(fs, memberId, year);

    await fs.setDoc(totalPath, {
      totalMs,
      totalHours: totalMs / 3_600_000,
      sessions: completedSessions,
      year,
    });

    return c.json({ ok: true, durationMs, totalHours: totalMs / 3_600_000 });
  })
  // Attendance summary — admin only. One row per member: current status,
  // last sign-in, and total hours for the current year.
  .get("/admin/summary", requireAuth, async (c) => {
    if (!c.get("userIsAdmin")) return c.json({ error: "Forbidden." }, 403);

    await autoSignOut(c.env);
    const fs = db(c.env);
    const year = schoolYear(new Date());
    const members = await fs.listCollection("members");

    const summaries = await Promise.all(
      members.map(async (member) => {
        const memberId = member.id;
        const sessions = await fs.listCollection(`members/${memberId}/sessions`);
        let latestSignIn: Date | null = null;
        let totalMs = 0;
        let signedIn = false;

        for (const session of sessions) {
          const signInRaw = session.data.signIn;
          const signIn = signInRaw instanceof Date ? signInRaw : new Date(signInRaw as string);
          if (Number.isNaN(signIn.getTime())) continue;

          if (!latestSignIn || signIn > latestSignIn) latestSignIn = signIn;
          if (schoolYear(signIn) !== year) continue;

          const isOpen = session.data.status === "open" || session.data.signOut == null;
          if (isOpen) {
            signedIn = true;
            totalMs += Math.max(0, Date.now() - signIn.getTime());
            continue;
          }

          if (session.data.status === "auto-closed") continue;

          const durationMs = session.data.durationMs;
          if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
            totalMs += Math.max(0, durationMs);
            continue;
          }

          const signOutRaw = session.data.signOut;
          const signOut = signOutRaw instanceof Date ? signOutRaw : new Date(signOutRaw as string);
          if (!Number.isNaN(signOut.getTime())) {
            totalMs += Math.max(0, signOut.getTime() - signIn.getTime());
          }
        }

        return {
          id: memberId,
          displayName: (member.data.displayName as string) ?? memberId,
          email: (member.data.email as string) ?? "",
          signedIn,
          lastSignIn: latestSignIn?.toISOString() ?? null,
          totalHours: totalMs / 3_600_000,
        };
      }),
    );

    summaries.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return c.json({ year, members: summaries });
  })
  // Who's currently signed in — any logged-in user can view.
  .get("/status", requireAuth, async (c) => {
    await autoSignOut(c.env);
    const fs = db(c.env);
    const open = await listOpenSessions(fs);
    const signedIn = open.map(({ member }) => (member.data.displayName as string) ?? member.id);

    return c.json({ signedIn });
  });

async function autoSignOut(env: AppEnv["Bindings"]) {
  const fs = db(env);
  const now = Date.now();
  const open = await listOpenSessions(fs);
  const stale = open
    .map(({ session, member }) => {
      const raw = session.data.signIn;
      const signIn = raw instanceof Date ? raw : new Date(raw as string);
      return { session, member, signIn };
    })
    .filter(
      ({ signIn }) => !Number.isNaN(signIn.getTime()) && now - signIn.getTime() >= AUTO_SIGNOUT_MS,
    );

  await Promise.all(
    stale.map(async ({ session, member, signIn }) => {
      await fs.updateDoc(session.path, {
        signOut: new Date(signIn.getTime() + AUTO_SIGNOUT_MS),
        durationMs: 0,
        status: "auto-closed",
      });
      const year = schoolYear(signIn);
      const totalPath = `members/${member.id}/totals/${year}`;
      const { totalMs, completedSessions } = await calculateSchoolYearTotals(fs, member.id, year);
      await fs.setDoc(totalPath, {
        totalMs,
        totalHours: totalMs / 3_600_000,
        sessions: completedSessions,
        year,
      });
    }),
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
