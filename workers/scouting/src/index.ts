import { sendDM } from "@g3/slack";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { requireAuth } from "./middleware/auth";
import type { AppEnv } from "./types";

type Tier = { id: string; name: string; color: string; items: string[] };
type TierListInput = { name?: unknown; description?: unknown; tiers?: unknown };
type ScoutingField = {
  id: string;
  label: string;
  caption?: string;
  type: "shortText" | "longText" | "mcq" | "slider" | "fieldMap" | "multiSelect" | "counter";
  required: boolean;
  options: string[];
  min: number;
  max: number;
  step: number;
};
type G3IdUser = {
  id: string;
  email: string;
  displayName: string;
  status: "pending" | "active" | "rejected" | "merged";
  slackUserId?: string;
};
type TbaMatch = {
  key: string;
  comp_level: string;
  set_number: number;
  match_number: number;
  time: number | null;
  predicted_time: number | null;
  actual_time: number | null;
  alliances: {
    red: { team_keys: string[]; score: number };
    blue: { team_keys: string[]; score: number };
  };
};
type TbaTeam = { key: string; team_number: number; nickname: string | null; name: string };
const app = new Hono<AppEnv>();
let pitSettingsSyncAt = 0;

app.onError((error, c) => {
  console.error("[scouting]", error);
  return c.json({ error: "Internal server error." }, 500);
});

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      if (origin.endsWith(".g3robotics.com")) return origin;
      if (origin.startsWith("http://localhost:")) return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  }),
);

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function text(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function teamNumber(value: unknown) {
  const candidate = text(value, 6);
  if (!/^\d{1,6}$/.test(candidate) || Number(candidate) < 1) return "";
  return String(Number(candidate));
}

function stringArray(value: unknown, maxItems = 100) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((item) => text(item, 300))
    .filter(Boolean);
}

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return typeof value === "string" ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

app.get("/health", (c) => c.json({ status: "ok", service: "scouting" }));
async function isStrategyAdmin(c: Context<AppEnv>) {
  if (c.get("userIsAdmin")) return true;
  const row = await c.env.SCOUTING_DB.prepare(
    "SELECT user_id FROM strategy_admins WHERE user_id = ?",
  )
    .bind(c.get("userId"))
    .first();
  return Boolean(row);
}

async function isServiceHelper(c: Context<AppEnv>) {
  const row = await c.env.SCOUTING_DB.prepare(
    "SELECT user_id FROM service_helpers WHERE user_id = ?",
  )
    .bind(c.get("userId"))
    .first();
  return Boolean(row);
}

app.get("/me", requireAuth, async (c) =>
  c.json({
    userId: c.get("userId"),
    displayName: c.get("userDisplayName"),
    email: c.get("userEmail"),
    isAdmin: await isStrategyAdmin(c),
    isG3IdAdmin: c.get("userIsAdmin"),
    isHelper: await isServiceHelper(c),
  }),
);

function matchOrder(match: TbaMatch) {
  const level = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 }[match.comp_level] ?? 5;
  return level * 100_000 + match.set_number * 1_000 + match.match_number;
}

function matchLabel(match: TbaMatch) {
  if (match.comp_level === "qm") return `Qualification ${match.match_number}`;
  const level = { ef: "Eighthfinal", qf: "Quarterfinal", sf: "Semifinal", f: "Final" }[
    match.comp_level
  ];
  return `${level ?? match.comp_level.toUpperCase()} ${match.set_number}-${match.match_number}`;
}

function publicMatch(match: TbaMatch) {
  const scheduledTime = match.predicted_time ?? match.time;
  const redTeams = match.alliances.red.team_keys.map((team) => team.replace(/^frc/, ""));
  const blueTeams = match.alliances.blue.team_keys.map((team) => team.replace(/^frc/, ""));
  return {
    key: match.key,
    label: matchLabel(match),
    matchNumber: match.match_number,
    compLevel: match.comp_level,
    scheduledAt: scheduledTime ? scheduledTime * 1000 : null,
    teams: [...redTeams, ...blueTeams],
    redTeams,
    blueTeams,
  };
}

async function getTbaAuthKey(c: Context<AppEnv>) {
  const config = await c.env.SCOUTING_DB.prepare(
    "SELECT tba_auth_key FROM strategy_event_config WHERE id = 1",
  ).first<{ tba_auth_key: string | null }>();
  return config?.tba_auth_key || c.env.TBA_AUTH_KEY || "";
}

type PitSettings = {
  eventKey: string;
  nexusEventKey: string;
  tbaAuthKey: string;
  nexusApiKey: string;
};

async function syncPitSettings(c: Context<AppEnv>) {
  if (!c.get("userIsAdmin")) return null;
  if (Date.now() - pitSettingsSyncAt < 300_000) return null;
  const response = await c.env.PIT.fetch(
    new Request("http://pit/admin/settings", {
      headers: { cookie: c.req.header("Cookie") ?? "" },
    }),
  );
  if (!response.ok) return null;
  const settings = (await response.json()) as PitSettings;
  const current = await c.env.SCOUTING_DB.prepare(
    "SELECT event_key, tba_auth_key, nexus_event_key, nexus_api_key FROM strategy_event_config WHERE id = 1",
  ).first<{
    event_key: string;
    tba_auth_key: string | null;
    nexus_event_key: string | null;
    nexus_api_key: string | null;
  }>();
  const eventKey = current?.event_key || settings.eventKey;
  const changed =
    !current ||
    current.event_key !== eventKey ||
    current.tba_auth_key !== settings.tbaAuthKey ||
    current.nexus_event_key !== settings.nexusEventKey ||
    current.nexus_api_key !== settings.nexusApiKey;
  if (changed)
    await c.env.SCOUTING_DB.prepare(
      `INSERT INTO strategy_event_config
       (id, event_key, current_match_number, tba_auth_key, nexus_event_key, nexus_api_key, updated_by, updated_at)
     VALUES (1, ?, NULL, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       event_key = CASE WHEN strategy_event_config.event_key = '' THEN excluded.event_key ELSE strategy_event_config.event_key END,
       tba_auth_key = excluded.tba_auth_key,
       nexus_event_key = excluded.nexus_event_key,
       nexus_api_key = excluded.nexus_api_key,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
    )
      .bind(
        eventKey,
        settings.tbaAuthKey,
        settings.nexusEventKey,
        settings.nexusApiKey,
        c.get("userId"),
        Date.now(),
      )
      .run();
  pitSettingsSyncAt = Date.now();
  return settings;
}

async function getTbaMatches(c: Context<AppEnv>, eventKey: string) {
  const now = Date.now();
  const cached = await c.env.SCOUTING_DB.prepare(
    "SELECT matches_json FROM tba_match_cache WHERE event_key = ? AND expires_at > ?",
  )
    .bind(eventKey, now)
    .first<{ matches_json: string }>();
  if (cached) return parseJson<TbaMatch[]>(cached.matches_json, []);
  const tbaAuthKey = await getTbaAuthKey(c);
  if (!tbaAuthKey) throw new Error("TBA authentication key is not configured.");
  const response = await fetch(
    `https://www.thebluealliance.com/api/v3/event/${encodeURIComponent(eventKey)}/matches`,
    { headers: { "X-TBA-Auth-Key": tbaAuthKey } },
  );
  if (!response.ok) throw new Error(`The Blue Alliance returned ${response.status}.`);
  const matches = (await response.json()) as TbaMatch[];
  await c.env.SCOUTING_DB.prepare(
    "INSERT OR REPLACE INTO tba_match_cache (event_key, matches_json, expires_at) VALUES (?, ?, ?)",
  )
    .bind(eventKey, JSON.stringify(matches), now + 30_000)
    .run();
  return matches;
}

async function getTbaTeams(c: Context<AppEnv>, eventKey: string) {
  const now = Date.now();
  const cached = await c.env.SCOUTING_DB.prepare(
    "SELECT teams_json FROM tba_team_cache WHERE event_key = ? AND expires_at > ?",
  )
    .bind(eventKey, now)
    .first<{ teams_json: string }>();
  if (cached) return parseJson<TbaTeam[]>(cached.teams_json, []);
  const tbaAuthKey = await getTbaAuthKey(c);
  if (!tbaAuthKey) throw new Error("TBA authentication key is not configured.");
  const response = await fetch(
    `https://www.thebluealliance.com/api/v3/event/${encodeURIComponent(eventKey)}/teams/simple`,
    { headers: { "X-TBA-Auth-Key": tbaAuthKey } },
  );
  if (!response.ok) throw new Error(`The Blue Alliance returned ${response.status}.`);
  const teams = (await response.json()) as TbaTeam[];
  await c.env.SCOUTING_DB.prepare(
    "INSERT OR REPLACE INTO tba_team_cache (event_key, teams_json, expires_at) VALUES (?, ?, ?)",
  )
    .bind(eventKey, JSON.stringify(teams), now + 3_600_000)
    .run();
  return teams;
}

app.get("/teams/search", requireAuth, async (c) => {
  const query = text(c.req.query("q"), 80).toLowerCase();
  if (!query) return c.json({ teams: [], message: null });
  const config = await c.env.SCOUTING_DB.prepare(
    "SELECT event_key FROM strategy_event_config WHERE id = 1",
  ).first<{ event_key: string }>();
  if (!config?.event_key)
    return c.json({ teams: [], message: "Set the TBA event key in Scouting Forms first." });
  try {
    const teams = (await getTbaTeams(c, config.event_key))
      .filter((team) => {
        const number = String(team.team_number);
        const name = (team.nickname || team.name || "").toLowerCase();
        return number.includes(query) || name.includes(query);
      })
      .sort((left, right) => {
        const leftNumber = String(left.team_number);
        const rightNumber = String(right.team_number);
        const leftExact = leftNumber === query ? 0 : leftNumber.startsWith(query) ? 1 : 2;
        const rightExact = rightNumber === query ? 0 : rightNumber.startsWith(query) ? 1 : 2;
        return leftExact - rightExact || left.team_number - right.team_number;
      })
      .slice(0, 8)
      .map((team) => ({ number: String(team.team_number), name: team.nickname || team.name }));
    return c.json({ teams, message: teams.length ? null : "No matching teams at this event." });
  } catch (error) {
    return c.json({
      teams: [],
      message: error instanceof Error ? error.message : "Could not load teams from TBA.",
    });
  }
});

async function resolveEventLink(c: Context<AppEnv>) {
  const config = await c.env.SCOUTING_DB.prepare(
    "SELECT event_key, current_match_number, tba_auth_key FROM strategy_event_config WHERE id = 1",
  ).first<{
    event_key: string;
    current_match_number: number | null;
    tba_auth_key: string | null;
  }>();
  if (!config?.event_key) return { eventKey: null, matchKey: null, matchNumber: null };
  let current: TbaMatch | undefined;
  try {
    const matches = (await getTbaMatches(c, config.event_key)).sort(
      (a, b) => matchOrder(a) - matchOrder(b),
    );
    current = config.current_match_number
      ? matches.find(
          (match) =>
            match.comp_level === "qm" && match.match_number === config.current_match_number,
        )
      : matches.find(
          (match) =>
            match.actual_time === null &&
            match.alliances.red.score < 0 &&
            match.alliances.blue.score < 0,
        );
  } catch {
    // Keep the configured event link when TBA is temporarily unavailable.
  }
  return {
    eventKey: config.event_key,
    matchKey: current?.key ?? null,
    matchNumber: current?.match_number ?? config.current_match_number,
  };
}

app.get("/event-context", requireAuth, async (c) => {
  const admin = await isStrategyAdmin(c);
  const now = Date.now();
  if (admin) await syncPitSettings(c).catch(() => null);
  const config = await c.env.SCOUTING_DB.prepare(
    "SELECT event_key, current_match_number, tba_auth_key, nexus_event_key, nexus_api_key FROM strategy_event_config WHERE id = 1",
  ).first<{
    event_key: string;
    current_match_number: number | null;
    tba_auth_key: string | null;
    nexus_event_key: string | null;
    nexus_api_key: string | null;
  }>();
  const eventKey = config?.event_key ?? "";
  let matches: TbaMatch[] = [];
  let scheduleError = "";
  if (eventKey) {
    try {
      matches = (await getTbaMatches(c, eventKey)).sort((a, b) => matchOrder(a) - matchOrder(b));
    } catch (error) {
      scheduleError = error instanceof Error ? error.message : "Could not load the TBA schedule.";
    }
  }
  const manualCurrent = config?.current_match_number
    ? matches.find(
        (match) => match.comp_level === "qm" && match.match_number === config.current_match_number,
      )
    : undefined;
  const current =
    manualCurrent ??
    matches.find(
      (match) =>
        match.actual_time === null &&
        match.alliances.red.score < 0 &&
        match.alliances.blue.score < 0,
    ) ??
    matches.at(-1);
  const teamSchedule = matches.filter((match) =>
    [...match.alliances.red.team_keys, ...match.alliances.blue.team_keys].includes("frc1648"),
  );
  const nextTeamMatch = current
    ? teamSchedule.find((match) => matchOrder(match) >= matchOrder(current))
    : teamSchedule[0];
  const onlineAdmins = admin
    ? await c.env.SCOUTING_DB.prepare(
        "SELECT user_id, display_name, last_seen_at FROM strategy_presence WHERE is_admin = 1 AND last_seen_at >= ? ORDER BY display_name",
      )
        .bind(now - 90_000)
        .all<Record<string, unknown>>()
    : null;
  return c.json({
    eventKey: admin ? eventKey : "",
    currentMatchNumber: admin ? (config?.current_match_number ?? null) : null,
    currentMatch: current ? publicMatch(current) : null,
    nextTeamMatch: nextTeamMatch ? publicMatch(nextTeamMatch) : null,
    teamSchedule: admin ? teamSchedule.map(publicMatch) : [],
    onlineAdmins: onlineAdmins?.results ?? [],
    scheduleError: admin ? scheduleError : "",
    hasTbaAuthKey: admin ? Boolean(config?.tba_auth_key || c.env.TBA_AUTH_KEY) : false,
    tbaAuthKey: "",
    nexusEventKey: admin ? config?.nexus_event_key || eventKey : "",
    hasNexusApiKey: admin ? Boolean(config?.nexus_api_key) : false,
    nexusApiKey: "",
  });
});

app.put("/event-context", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const body = await c.req.json<Record<string, unknown>>();
  const eventKey = text(body.eventKey, 30).toLowerCase();
  const tbaAuthKey = text(body.tbaAuthKey, 200);
  const nexusEventKey = text(body.nexusEventKey, 30).toLowerCase() || eventKey;
  const nexusApiKey = text(body.nexusApiKey, 300);
  if ((tbaAuthKey || nexusApiKey) && !c.get("userIsAdmin"))
    return c.json({ error: "Only a G3ID admin can update API keys." }, 403);
  if (eventKey && !/^\d{4}[a-z0-9]+$/.test(eventKey))
    return c.json({ error: "Enter a valid TBA event key, such as 2026gadal." }, 400);
  const requestedMatch = body.currentMatchNumber;
  const currentMatchNumber =
    requestedMatch === "" || requestedMatch === null || requestedMatch === undefined
      ? null
      : Number(requestedMatch);
  if (
    currentMatchNumber !== null &&
    (!Number.isInteger(currentMatchNumber) || currentMatchNumber < 1)
  )
    return c.json({ error: "Current match must be a positive qualification match number." }, 400);
  await c.env.SCOUTING_DB.prepare(
    `INSERT INTO strategy_event_config (id, event_key, current_match_number, tba_auth_key, nexus_event_key, nexus_api_key, updated_by, updated_at)
     VALUES (1, ?, ?, NULLIF(?, ''), ?, NULLIF(?, ''), ?, ?)
     ON CONFLICT(id) DO UPDATE SET event_key = excluded.event_key,
       current_match_number = excluded.current_match_number,
       tba_auth_key = CASE WHEN excluded.tba_auth_key IS NULL THEN strategy_event_config.tba_auth_key ELSE excluded.tba_auth_key END,
       nexus_event_key = excluded.nexus_event_key,
       nexus_api_key = CASE WHEN excluded.nexus_api_key IS NULL THEN strategy_event_config.nexus_api_key ELSE excluded.nexus_api_key END,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  )
    .bind(
      eventKey,
      currentMatchNumber,
      tbaAuthKey,
      nexusEventKey,
      nexusApiKey,
      c.get("userId"),
      Date.now(),
    )
    .run();
  return c.json({ ok: true });
});

app.get("/announcements/active", requireAuth, async (c) => {
  const rows = await c.env.SCOUTING_DB.prepare(
    `SELECT id, message, created_by_name, created_at, expires_at
     FROM strategy_announcements
     WHERE expires_at > ?
     ORDER BY created_at DESC
     LIMIT 5`,
  )
    .bind(Date.now())
    .all<Record<string, unknown>>();
  return c.json({ announcements: rows.results });
});

app.put("/presence", requireAuth, async (c) => {
  const body: Record<string, unknown> = await c.req
    .json<Record<string, unknown>>()
    .catch(() => ({}));
  const allowedPages = new Set([
    "forms",
    "admin",
    "analysis",
    "service",
    "autos",
    "other",
    "tiers",
    "maps",
  ]);
  const requestedPage = text(body.page, 30);
  const currentPage = allowedPages.has(requestedPage) ? requestedPage : "forms";
  await c.env.SCOUTING_DB.prepare(
    `INSERT INTO strategy_presence (user_id, display_name, is_admin, last_seen_at, current_page)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name,
       is_admin = excluded.is_admin, last_seen_at = excluded.last_seen_at,
       current_page = excluded.current_page`,
  )
    .bind(
      c.get("userId"),
      c.get("userDisplayName"),
      (await isStrategyAdmin(c)) ? 1 : 0,
      Date.now(),
      currentPage,
    )
    .run();
  return c.json({ ok: true });
});

app.get("/presence", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const rows = await c.env.SCOUTING_DB.prepare(
    `SELECT user_id, display_name, is_admin, last_seen_at, current_page
     FROM strategy_presence
     WHERE last_seen_at >= ?
     ORDER BY is_admin DESC, display_name`,
  )
    .bind(Date.now() - 75_000)
    .all<Record<string, unknown>>();
  return c.json({ users: rows.results });
});

app.post("/announcements", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const body = await c.req.json<Record<string, unknown>>();
  const message = text(body.message, 500);
  const durationSeconds = Number(body.durationSeconds);
  if (!message) return c.json({ error: "Enter an announcement." }, 400);
  if (![30, 60, 300, 600].includes(durationSeconds))
    return c.json({ error: "Choose a valid announcement duration." }, 400);
  const now = Date.now();
  const announcementId = id("announcement");
  await c.env.SCOUTING_DB.prepare(
    `INSERT INTO strategy_announcements
       (id, message, created_by, created_by_name, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      announcementId,
      message,
      c.get("userId"),
      c.get("userDisplayName"),
      now,
      now + durationSeconds * 1000,
    )
    .run();
  return c.json({ id: announcementId }, 201);
});

function parseScoutingFields(value: unknown): ScoutingField[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const allowedTypes = new Set([
    "shortText",
    "longText",
    "mcq",
    "slider",
    "fieldMap",
    "multiSelect",
    "counter",
  ]);
  const fields = value.map((candidate) => {
    const field = candidate as Record<string, unknown>;
    return {
      id: text(field.id, 100),
      label: text(field.label, 120),
      caption: text(field.caption, 500),
      type: text(field.type, 20) as ScoutingField["type"],
      required: field.required === true,
      options: stringArray(field.options, 30),
      min: Number.isFinite(Number(field.min)) ? Number(field.min) : 0,
      max: Number.isFinite(Number(field.max)) ? Number(field.max) : 10,
      step:
        field.type === "counter"
          ? 1
          : Number.isFinite(Number(field.step)) && Number(field.step) > 0
            ? Number(field.step)
            : 1,
    };
  });
  if (fields.some((field) => !field.id || !field.label || !allowedTypes.has(field.type)))
    return null;
  return fields;
}

app.get("/scouting-forms", requireAuth, async (c) => {
  const query =
    "SELECT * FROM scouting_forms WHERE form_kind IN ('scouting', 'pit') ORDER BY form_kind DESC";
  const rows = await c.env.SCOUTING_DB.prepare(query).all<Record<string, unknown>>();
  return c.json({
    forms: rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      fields: parseJson<ScoutingField[]>(row.fields_json, []),
      isActive: Boolean(row.is_active),
      kind: row.form_kind,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
});

app.post("/scouting-forms", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const body = await c.req.json<Record<string, unknown>>();
  const name = text(body.name, 120);
  const fields = parseScoutingFields(body.fields);
  if (!name || !fields?.length)
    return c.json({ error: "A name and at least one valid field are required." }, 400);
  const formId = id("form");
  const now = Date.now();
  await c.env.SCOUTING_DB.prepare(
    "INSERT INTO scouting_forms (id, name, description, fields_json, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      formId,
      name,
      text(body.description, 1000),
      JSON.stringify(fields),
      1,
      c.get("userId"),
      now,
      now,
    )
    .run();
  return c.json({ id: formId }, 201);
});

app.put("/scouting-forms/:id", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const body = await c.req.json<Record<string, unknown>>();
  const name = text(body.name, 120);
  const fields = parseScoutingFields(body.fields);
  if (!name || !fields?.length)
    return c.json({ error: "A name and at least one valid field are required." }, 400);
  await c.env.SCOUTING_DB.prepare(
    "UPDATE scouting_forms SET name = ?, description = ?, fields_json = ?, is_active = ?, updated_at = ? WHERE id = ?",
  )
    .bind(
      name,
      text(body.description, 1000),
      JSON.stringify(fields),
      1,
      Date.now(),
      c.req.param("id"),
    )
    .run();
  return c.json({ ok: true });
});

app.delete("/scouting-forms/:id", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  await c.env.SCOUTING_DB.prepare("UPDATE scouting_forms SET is_active = 0 WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.post("/scouting-forms/:id/submissions", requireAuth, async (c) => {
  const formDefinition = await c.env.SCOUTING_DB.prepare(
    "SELECT fields_json FROM scouting_forms WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ fields_json: string }>();
  if (!formDefinition) return c.json({ error: "Scouting form not found or inactive." }, 404);
  const form = await c.req.formData();
  const teamName = teamNumber(form.get("teamName"));
  if (!teamName) return c.json({ error: "A valid team number is required." }, 400);
  const answers = parseJson<Record<string, unknown>>(form.get("answers"), {});
  const fields = parseJson<ScoutingField[]>(formDefinition.fields_json, []);
  const cleanAnswers: Record<string, string | number | boolean | string[]> = {};
  for (const field of fields) {
    const value = answers[field.id];
    if (
      field.required &&
      field.type !== "fieldMap" &&
      (value === undefined || value === null || value === "" || value === false)
    ) {
      return c.json({ error: `${field.label} is required.` }, 400);
    }
    if (field.required && field.type === "multiSelect" && stringArray(value, 30).length === 0)
      return c.json({ error: `${field.label} is required.` }, 400);
    if (field.type === "multiSelect") cleanAnswers[field.id] = stringArray(value, 30);
    else if (
      (field.type === "slider" || field.type === "counter") &&
      value !== "" &&
      value !== undefined
    )
      cleanAnswers[field.id] = Number(value);
    else if (field.type !== "fieldMap") cleanAnswers[field.id] = text(value, 3000);
  }
  const submissionId = id("submission");
  const drawing = form.get("drawing");
  let drawingKey: string | null = null;
  let drawingType: string | null = null;
  const drawingFields: Record<string, { key: string; contentType: string }> = {};
  if (drawing instanceof File && drawing.size > 0) {
    if (!drawing.type.startsWith("image/") || drawing.size > 12 * 1024 * 1024)
      return c.json({ error: "The field drawing must be an image under 12 MB." }, 400);
    drawingKey = `scouting-submissions/${submissionId}.png`;
    drawingType = drawing.type;
    await c.env.FIELD_MAPS.put(drawingKey, await drawing.arrayBuffer(), {
      httpMetadata: { contentType: drawing.type },
    });
  }
  for (const field of fields.filter((candidate) => candidate.type === "fieldMap")) {
    const fieldDrawing = form.get(`drawing:${field.id}`);
    if (!(fieldDrawing instanceof File) || fieldDrawing.size === 0) {
      if (field.required) return c.json({ error: `${field.label} is required.` }, 400);
      continue;
    }
    if (!fieldDrawing.type.startsWith("image/") || fieldDrawing.size > 12 * 1024 * 1024)
      return c.json({ error: "Field drawings must be images under 12 MB." }, 400);
    const key = `scouting-submissions/${submissionId}/${field.id}.png`;
    await c.env.FIELD_MAPS.put(key, await fieldDrawing.arrayBuffer(), {
      httpMetadata: { contentType: fieldDrawing.type },
    });
    drawingFields[field.id] = { key, contentType: fieldDrawing.type };
  }
  const submittedAt = Date.now();
  const eventLink = await resolveEventLink(c);
  await c.env.SCOUTING_DB.prepare(
    "INSERT INTO scouting_form_submissions (id, form_id, fields_json, answers_json, drawing_r2_key, drawing_content_type, submitted_by, submitted_by_name, created_at, team_name, drawing_fields_json, event_key, match_key, match_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      submissionId,
      c.req.param("id"),
      formDefinition.fields_json,
      JSON.stringify(cleanAnswers),
      drawingKey,
      drawingType,
      c.get("userId"),
      c.get("userDisplayName"),
      submittedAt,
      teamName,
      JSON.stringify(drawingFields),
      eventLink.eventKey,
      eventLink.matchKey,
      eventLink.matchNumber,
    )
    .run();
  return c.json({ id: submissionId }, 201);
});

app.get("/scouting-forms/:id/submissions", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const rows = await c.env.SCOUTING_DB.prepare(
    "SELECT * FROM scouting_form_submissions WHERE form_id = ? ORDER BY created_at DESC",
  )
    .bind(c.req.param("id"))
    .all<Record<string, unknown>>();
  return c.json({
    submissions: rows.results.map((row) => ({
      id: row.id,
      answers: parseJson<Record<string, unknown>>(row.answers_json, {}),
      drawingUrl: row.drawing_r2_key ? `/scouting-submissions/${row.id}/drawing` : null,
      submittedByName: row.submitted_by_name,
      createdAt: row.created_at,
      teamName: row.team_name,
      drawings: Object.fromEntries(
        Object.keys(parseJson<Record<string, unknown>>(row.drawing_fields_json, {})).map(
          (fieldId) => [fieldId, `/scouting-submissions/${row.id}/drawings/${fieldId}`],
        ),
      ),
    })),
  });
});

app.get("/scouting-submissions/:id/drawing", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const row = await c.env.SCOUTING_DB.prepare(
    "SELECT drawing_r2_key, drawing_content_type FROM scouting_form_submissions WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ drawing_r2_key: string | null; drawing_content_type: string | null }>();
  if (!row?.drawing_r2_key) return c.json({ error: "Drawing not found." }, 404);
  const object = await c.env.FIELD_MAPS.get(row.drawing_r2_key);
  if (!object) return c.json({ error: "Drawing not found." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": row.drawing_content_type ?? "image/png",
      "Cache-Control": "private, max-age=300",
    },
  });
});

app.get("/scouting-submissions/:id/drawings/:fieldId", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const row = await c.env.SCOUTING_DB.prepare(
    "SELECT drawing_fields_json FROM scouting_form_submissions WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ drawing_fields_json: string }>();
  const drawing = parseJson<Record<string, { key: string; contentType: string }>>(
    row?.drawing_fields_json,
    {},
  )[c.req.param("fieldId")];
  if (!drawing) return c.json({ error: "Drawing not found." }, 404);
  const object = await c.env.FIELD_MAPS.get(drawing.key);
  if (!object) return c.json({ error: "Drawing not found." }, 404);
  return new Response(object.body, {
    headers: { "Content-Type": drawing.contentType, "Cache-Control": "private, max-age=300" },
  });
});

app.get("/tier-lists", requireAuth, async (c) => {
  const rows = await c.env.SCOUTING_DB.prepare(
    "SELECT * FROM tier_lists ORDER BY updated_at DESC",
  ).all<Record<string, unknown>>();
  return c.json({
    tierLists: rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      tiers: parseJson<Tier[]>(row.tiers_json, []),
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
});

app.post("/tier-lists", requireAuth, async (c) => {
  const body = await c.req.json<TierListInput>();
  const name = text(body.name, 120);
  if (!name) return c.json({ error: "Name is required." }, 400);
  const tiers = Array.isArray(body.tiers) ? body.tiers : [];
  const recordId = id("tier");
  const now = Date.now();
  await c.env.SCOUTING_DB.prepare(
    "INSERT INTO tier_lists (id, name, description, tiers_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      recordId,
      name,
      text(body.description, 500),
      JSON.stringify(tiers),
      c.get("userId"),
      now,
      now,
    )
    .run();
  return c.json({ id: recordId }, 201);
});

app.put("/tier-lists/:id", requireAuth, async (c) => {
  const body = await c.req.json<TierListInput>();
  const name = text(body.name, 120);
  if (!name || !Array.isArray(body.tiers)) {
    return c.json({ error: "Name and tiers are required." }, 400);
  }
  await c.env.SCOUTING_DB.prepare(
    "UPDATE tier_lists SET name = ?, description = ?, tiers_json = ?, updated_at = ? WHERE id = ?",
  )
    .bind(
      name,
      text(body.description, 500),
      JSON.stringify(body.tiers),
      Date.now(),
      c.req.param("id"),
    )
    .run();
  return c.json({ ok: true });
});

app.delete("/tier-lists/:id", requireAuth, async (c) => {
  await c.env.SCOUTING_DB.prepare("DELETE FROM tier_lists WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.get("/field-maps", requireAuth, async (c) => {
  const rows = await c.env.SCOUTING_DB.prepare(
    "SELECT * FROM field_maps ORDER BY updated_at DESC",
  ).all<Record<string, unknown>>();
  return c.json({
    fieldMaps: rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      eventName: row.event_name,
      notes: row.notes,
      imageUrl: `/field-maps/${row.id}/image`,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
});

async function canShareFieldMaps(c: Context<AppEnv>) {
  if (c.get("userIsAdmin")) return true;
  const permission = await c.env.SCOUTING_DB.prepare(
    "SELECT email FROM field_map_publishers WHERE email = ?",
  )
    .bind(c.get("userEmail").toLowerCase())
    .first();
  return Boolean(permission);
}

app.get("/field-map-permissions", requireAuth, async (c) =>
  c.json({ canShare: await canShareFieldMaps(c), isAdmin: c.get("userIsAdmin") }),
);

app.get("/field-map-publishers", requireAuth, async (c) => {
  if (!c.get("userIsAdmin")) return c.json({ error: "Admin access required." }, 403);
  const rows = await c.env.SCOUTING_DB.prepare(
    "SELECT email, created_at FROM field_map_publishers ORDER BY email",
  ).all<{ email: string; created_at: number }>();
  return c.json({ publishers: rows.results });
});

async function getG3IdUsers(c: Context<AppEnv>) {
  if (c.env.LOCAL_AUTH_BYPASS === "true") {
    return [
      {
        id: c.get("userId"),
        email: c.get("userEmail"),
        displayName: c.get("userDisplayName"),
        status: "active" as const,
      },
    ];
  }
  const response = await c.env.G3ID.fetch(
    new Request("http://g3id/users", {
      headers: { cookie: c.req.header("Cookie") ?? "" },
    }),
  );
  if (!response.ok) return null;
  return (await response.json()) as G3IdUser[];
}

app.get("/strategy-admins", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const admins = await c.env.SCOUTING_DB.prepare(
    "SELECT user_id, email, display_name, created_at FROM strategy_admins ORDER BY display_name",
  ).all<Record<string, unknown>>();
  const users = c.get("userIsAdmin") ? await getG3IdUsers(c) : null;
  return c.json({ admins: admins.results, users: users ?? [], canManage: c.get("userIsAdmin") });
});

app.post("/strategy-admins", requireAuth, async (c) => {
  if (!c.get("userIsAdmin"))
    return c.json({ error: "Only a G3ID admin can assign Strategy leads." }, 403);
  const body = await c.req.json<{ userId?: unknown }>();
  const userId = text(body.userId, 200);
  const users = await getG3IdUsers(c);
  const user = users?.find((candidate) => candidate.id === userId && candidate.status === "active");
  if (!user) return c.json({ error: "Select an active G3ID account." }, 400);
  await c.env.SCOUTING_DB.prepare(
    "INSERT OR REPLACE INTO strategy_admins (user_id, email, display_name, granted_by, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(user.id, user.email.toLowerCase(), user.displayName, c.get("userId"), Date.now())
    .run();
  return c.json({ ok: true }, 201);
});

app.delete("/strategy-admins/:userId", requireAuth, async (c) => {
  if (!c.get("userIsAdmin"))
    return c.json({ error: "Only a G3ID admin can remove Strategy leads." }, 403);
  await c.env.SCOUTING_DB.prepare("DELETE FROM strategy_admins WHERE user_id = ?")
    .bind(c.req.param("userId"))
    .run();
  return c.json({ ok: true });
});

app.get("/analysis", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const team = teamNumber(c.req.query("team"));
  const teamB = teamNumber(c.req.query("teamB"));
  const includeArchived = c.req.query("archived") === "true";
  const where = team ? (teamB ? "s.team_name IN (?, ?)" : "s.team_name = ?") : "1 = 1";
  const bindings = team ? (teamB ? [team, teamB] : [team]) : [];
  const commentWhere = team ? (teamB ? "team_name IN (?, ?)" : "team_name = ?") : "1 = 1";
  const [rows, teamComments, eventConfig] = await Promise.all([
    c.env.SCOUTING_DB.prepare(
      `SELECT s.*, f.name AS form_name, f.form_kind,
         COALESCE(s.fields_json, f.fields_json) AS fields_json
       FROM scouting_form_submissions s
       JOIN scouting_forms f ON f.id = s.form_id
       WHERE ${where} ${includeArchived ? "" : "AND s.archived_at IS NULL"}
       ORDER BY CASE WHEN s.starred_fields_json = '[]' THEN 1 ELSE 0 END, s.created_at DESC`,
    )
      .bind(...bindings)
      .all<Record<string, unknown>>(),
    c.env.SCOUTING_DB.prepare(
      `SELECT * FROM team_comments WHERE ${commentWhere} ORDER BY created_at DESC`,
    )
      .bind(...bindings)
      .all<Record<string, unknown>>(),
    c.env.SCOUTING_DB.prepare("SELECT event_key FROM strategy_event_config WHERE id = 1").first<{
      event_key: string;
    }>(),
  ]);
  let teamMatches: Record<string, unknown>[] = [];
  if (team && eventConfig?.event_key) {
    try {
      const matches = (await getTbaMatches(c, eventConfig.event_key)).sort(
        (a, b) => matchOrder(a) - matchOrder(b),
      );
      const teamKey = `frc${team}`;
      teamMatches = matches
        .filter((match) =>
          [...match.alliances.red.team_keys, ...match.alliances.blue.team_keys].includes(teamKey),
        )
        .map((match) => {
          const alliance = match.alliances.red.team_keys.includes(teamKey) ? "red" : "blue";
          const partner = match.alliances[alliance].team_keys.includes("frc1648");
          const opponent =
            match.alliances[alliance === "red" ? "blue" : "red"].team_keys.includes("frc1648");
          return {
            ...publicMatch(match),
            alliance,
            redTeams: match.alliances.red.team_keys.map((key) => key.replace(/^frc/, "")),
            blueTeams: match.alliances.blue.team_keys.map((key) => key.replace(/^frc/, "")),
            redScore: match.alliances.red.score,
            blueScore: match.alliances.blue.score,
            relationTo1648: partner ? "with" : opponent ? "against" : "none",
            played: match.alliances.red.score >= 0 && match.alliances.blue.score >= 0,
          };
        });
    } catch {
      // Scouting data remains available when TBA is unavailable.
    }
  }
  return c.json({
    reports: rows.results.map((row) => ({
      id: row.id,
      teamName: row.team_name,
      formName: row.form_name,
      formKind: row.form_kind,
      fields: parseJson<ScoutingField[]>(row.fields_json, []),
      answers: parseJson<Record<string, unknown>>(row.answers_json, {}),
      drawings: Object.fromEntries(
        Object.keys(parseJson<Record<string, unknown>>(row.drawing_fields_json, {})).map(
          (fieldId) => [fieldId, `/scouting-submissions/${row.id}/drawings/${fieldId}`],
        ),
      ),
      submittedByName: row.submitted_by_name,
      createdAt: row.created_at,
      eventKey: row.event_key,
      matchKey: row.match_key,
      matchNumber: row.match_number,
      starredFieldIds: parseJson<string[]>(row.starred_fields_json, []),
      archivedAt: row.archived_at,
      archiveReason: row.archive_reason,
    })),
    teamComments: teamComments.results,
    teamMatches,
  });
});

app.put("/analysis/reports/:id/stars", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const body = await c.req.json<{ fieldId?: unknown; starred?: unknown }>();
  const fieldId = text(body.fieldId, 100);
  if (!fieldId) return c.json({ error: "Choose a report or answer to star." }, 400);
  const report = await c.env.SCOUTING_DB.prepare(
    `SELECT s.starred_fields_json, f.fields_json
     FROM scouting_form_submissions s
     JOIN scouting_forms f ON f.id = s.form_id
     WHERE s.id = ?`,
  )
    .bind(c.req.param("id"))
    .first<{ starred_fields_json: string; fields_json: string }>();
  if (!report) return c.json({ error: "Report not found." }, 404);
  const validFieldIds = new Set([
    "__report",
    ...parseJson<ScoutingField[]>(report.fields_json, []).map((field) => field.id),
  ]);
  if (!validFieldIds.has(fieldId)) return c.json({ error: "That answer no longer exists." }, 400);
  const starred = new Set(parseJson<string[]>(report.starred_fields_json, []));
  if (body.starred === true) starred.add(fieldId);
  else starred.delete(fieldId);
  await c.env.SCOUTING_DB.prepare(
    "UPDATE scouting_form_submissions SET starred_fields_json = ? WHERE id = ?",
  )
    .bind(JSON.stringify(Array.from(starred)), c.req.param("id"))
    .run();
  return c.json({ starredFieldIds: Array.from(starred) });
});

app.delete("/analysis/reports/:id", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const body: { reason?: unknown } = await c.req.json<{ reason?: unknown }>().catch(() => ({}));
  const result = await c.env.SCOUTING_DB.prepare(
    "UPDATE scouting_form_submissions SET archived_at = ?, archived_by = ?, archive_reason = ? WHERE id = ? AND archived_at IS NULL",
  )
    .bind(Date.now(), c.get("userId"), text(body.reason, 500), c.req.param("id"))
    .run();
  if (!result.meta.changes) return c.json({ error: "Active report not found." }, 404);
  return c.json({ ok: true });
});

app.put("/analysis/reports/:id/restore", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const result = await c.env.SCOUTING_DB.prepare(
    "UPDATE scouting_form_submissions SET archived_at = NULL, archived_by = NULL, archive_reason = NULL WHERE id = ? AND archived_at IS NOT NULL",
  )
    .bind(c.req.param("id"))
    .run();
  if (!result.meta.changes) return c.json({ error: "Archived report not found." }, 404);
  return c.json({ ok: true });
});

app.delete("/analysis/reports/:id/permanent", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const report = await c.env.SCOUTING_DB.prepare(
    "SELECT drawing_r2_key, drawing_fields_json FROM scouting_form_submissions WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ drawing_r2_key: string | null; drawing_fields_json: string }>();
  if (!report) return c.json({ error: "Report not found." }, 404);
  const fieldDrawings = Object.values(
    parseJson<Record<string, { key: string }>>(report.drawing_fields_json, {}),
  );
  await Promise.all([
    ...fieldDrawings.map((drawing) => c.env.FIELD_MAPS.delete(drawing.key)),
    ...(report.drawing_r2_key ? [c.env.FIELD_MAPS.delete(report.drawing_r2_key)] : []),
  ]);
  await c.env.SCOUTING_DB.prepare("DELETE FROM scouting_form_submissions WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.get("/field-map-publisher-options", requireAuth, async (c) => {
  if (!c.get("userIsAdmin")) return c.json({ error: "Admin access required." }, 403);
  const users = await getG3IdUsers(c);
  if (!users) return c.json({ error: "Could not load G3ID accounts." }, 502);
  return c.json({
    users: users
      .filter((user) => user.status === "active")
      .map(({ id, email, displayName }) => ({ id, email, displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
  });
});

app.post("/field-map-publishers", requireAuth, async (c) => {
  if (!c.get("userIsAdmin")) return c.json({ error: "Admin access required." }, 403);
  const body = await c.req.json<{ userId?: unknown }>();
  const userId = text(body.userId, 200);
  if (!userId) return c.json({ error: "Select a G3ID account." }, 400);
  const users = await getG3IdUsers(c);
  if (!users) return c.json({ error: "Could not validate the G3ID account." }, 502);
  const user = users.find((candidate) => candidate.id === userId && candidate.status === "active");
  if (!user) return c.json({ error: "Select an active G3ID account." }, 400);
  const email = user.email.toLowerCase();
  await c.env.SCOUTING_DB.prepare(
    "INSERT OR IGNORE INTO field_map_publishers (email, granted_by, created_at) VALUES (?, ?, ?)",
  )
    .bind(email, c.get("userId"), Date.now())
    .run();
  return c.json({ ok: true }, 201);
});

app.delete("/field-map-publishers/:email", requireAuth, async (c) => {
  if (!c.get("userIsAdmin")) return c.json({ error: "Admin access required." }, 403);
  await c.env.SCOUTING_DB.prepare("DELETE FROM field_map_publishers WHERE email = ?")
    .bind(decodeURIComponent(c.req.param("email")).toLowerCase())
    .run();
  return c.json({ ok: true });
});

app.post("/field-maps", requireAuth, async (c) => {
  if (!(await canShareFieldMaps(c))) {
    return c.json({ error: "You do not have permission to share field maps." }, 403);
  }
  const form = await c.req.formData();
  const image = form.get("image");
  const name = text(form.get("name"), 120);
  if (!(image instanceof File) || !image.type.startsWith("image/") || !name) {
    return c.json({ error: "A name and image are required." }, 400);
  }
  if (image.size > 12 * 1024 * 1024) {
    return c.json({ error: "Images must be smaller than 12 MB." }, 413);
  }

  const recordId = id("map");
  const extension = image.type === "image/jpeg" ? "jpg" : "png";
  const key = `field-maps/${recordId}.${extension}`;
  await c.env.FIELD_MAPS.put(key, await image.arrayBuffer(), {
    httpMetadata: { contentType: image.type },
  });
  const now = Date.now();
  await c.env.SCOUTING_DB.prepare(
    "INSERT INTO field_maps (id, name, event_name, notes, r2_key, content_type, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      recordId,
      name,
      text(form.get("eventName"), 120),
      text(form.get("notes"), 2000),
      key,
      image.type,
      c.get("userId"),
      now,
      now,
    )
    .run();
  return c.json({ id: recordId }, 201);
});

app.get("/field-maps/:id/image", requireAuth, async (c) => {
  const map = await c.env.SCOUTING_DB.prepare(
    "SELECT r2_key, content_type FROM field_maps WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ r2_key: string; content_type: string }>();
  if (!map) return c.json({ error: "Map not found." }, 404);
  const object = await c.env.FIELD_MAPS.get(map.r2_key);
  if (!object) return c.json({ error: "Image not found." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": map.content_type,
      "Cache-Control": "private, max-age=300",
    },
  });
});

app.delete("/field-maps/:id", requireAuth, async (c) => {
  const map = await c.env.SCOUTING_DB.prepare(
    "SELECT r2_key, created_by FROM field_maps WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ r2_key: string; created_by: string }>();
  if (!map) return c.json({ error: "Map not found." }, 404);
  if (!c.get("userIsAdmin") && map.created_by !== c.get("userId")) {
    return c.json({ error: "Only the publisher or an admin can delete this map." }, 403);
  }
  await Promise.all([
    c.env.FIELD_MAPS.delete(map.r2_key),
    c.env.SCOUTING_DB.prepare("DELETE FROM field_maps WHERE id = ?").bind(c.req.param("id")).run(),
  ]);
  return c.json({ ok: true });
});

app.get("/autos", requireAuth, async (c) => {
  const rows = await c.env.SCOUTING_DB.prepare(
    "SELECT * FROM auto_routines ORDER BY updated_at DESC",
  ).all<Record<string, unknown>>();
  return c.json({
    autos: rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      team: row.robot_name,
      description: row.summary,
      steps: parseJson<string[]>(row.steps_json, []),
      imageUrl: row.image_r2_key ? `/autos/${row.id}/image` : null,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
});

app.post("/autos", requireAuth, async (c) => {
  const form = await c.req.formData();
  const name = text(form.get("name"), 120);
  if (!name) return c.json({ error: "Name is required." }, 400);
  const rawTeam = text(form.get("team"), 40);
  const autoTeam = rawTeam ? teamNumber(rawTeam) : "";
  if (rawTeam && !autoTeam) return c.json({ error: "Team must be a valid team number." }, 400);

  const image = form.get("image");
  if (image instanceof File && !image.type.startsWith("image/")) {
    return c.json({ error: "The optional upload must be an image." }, 400);
  }
  if (image instanceof File && image.size > 12 * 1024 * 1024) {
    return c.json({ error: "Images must be smaller than 12 MB." }, 413);
  }

  const recordId = id("auto");
  const now = Date.now();
  let imageKey: string | null = null;
  let imageContentType: string | null = null;
  if (image instanceof File && image.size > 0) {
    const extension = image.type === "image/jpeg" ? "jpg" : "png";
    imageKey = `auto-images/${recordId}.${extension}`;
    imageContentType = image.type;
    await c.env.FIELD_MAPS.put(imageKey, await image.arrayBuffer(), {
      httpMetadata: { contentType: image.type },
    });
  }

  const steps = parseJson<unknown>(form.get("steps"), []);
  await c.env.SCOUTING_DB.prepare(
    "INSERT INTO auto_routines (id, name, robot_name, start_position, summary, steps_json, tags_json, image_r2_key, image_content_type, created_by, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?, '[]', ?, ?, ?, ?, ?)",
  )
    .bind(
      recordId,
      name,
      autoTeam,
      text(form.get("description"), 2000),
      JSON.stringify(stringArray(steps)),
      imageKey,
      imageContentType,
      c.get("userId"),
      now,
      now,
    )
    .run();
  return c.json({ id: recordId }, 201);
});

app.get("/autos/:id/image", requireAuth, async (c) => {
  const auto = await c.env.SCOUTING_DB.prepare(
    "SELECT image_r2_key, image_content_type FROM auto_routines WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ image_r2_key: string | null; image_content_type: string | null }>();
  if (!auto?.image_r2_key) return c.json({ error: "Image not found." }, 404);
  const object = await c.env.FIELD_MAPS.get(auto.image_r2_key);
  if (!object) return c.json({ error: "Image not found." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": auto.image_content_type ?? "image/png",
      "Cache-Control": "private, max-age=300",
    },
  });
});

app.delete("/autos/:id", requireAuth, async (c) => {
  const auto = await c.env.SCOUTING_DB.prepare(
    "SELECT image_r2_key FROM auto_routines WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ image_r2_key: string | null }>();
  if (auto?.image_r2_key) await c.env.FIELD_MAPS.delete(auto.image_r2_key);
  await c.env.SCOUTING_DB.prepare("DELETE FROM auto_routines WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

// Robot Library was retired. Keep its old tables untouched so existing data is not
// destructively deleted, but do not expose the legacy API surface.
app.all("/robots", (c) => c.json({ error: "Not found." }, 404));
app.all("/robots/*", (c) => c.json({ error: "Not found." }, 404));

app.get("/robots", requireAuth, async (c) => {
  const [teams, images] = await Promise.all([
    c.env.SCOUTING_DB.prepare("SELECT * FROM robot_teams ORDER BY updated_at DESC").all<
      Record<string, unknown>
    >(),
    c.env.SCOUTING_DB.prepare("SELECT * FROM robot_images ORDER BY created_at DESC").all<
      Record<string, unknown>
    >(),
  ]);
  return c.json({
    robots: teams.results.map((team) => ({
      id: team.id,
      teamName: team.team_name,
      summary: team.summary,
      updatedAt: team.updated_at,
      images: images.results
        .filter((image) => image.team_id === team.id)
        .map((image) => ({
          id: image.id,
          url: `/robots/images/${image.id}`,
          createdAt: image.created_at,
        })),
    })),
  });
});

app.post("/robots", requireAuth, async (c) => {
  const form = await c.req.formData();
  const teamName = teamNumber(form.get("teamName"));
  if (!teamName) return c.json({ error: "A valid team number is required." }, 400);
  const teamId = id("robot");
  const now = Date.now();
  await c.env.SCOUTING_DB.prepare(
    "INSERT INTO robot_teams (id, team_name, summary, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(teamId, teamName, text(form.get("summary"), 3000), c.get("userId"), now, now)
    .run();
  const files = form.getAll("images").filter((value): value is File => value instanceof File);
  for (const file of files.slice(0, 20)) {
    if (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) continue;
    const imageId = id("robot_image");
    const extension =
      file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
    const key = `robot-images/${teamId}/${imageId}.${extension}`;
    await c.env.FIELD_MAPS.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
    await c.env.SCOUTING_DB.prepare(
      "INSERT INTO robot_images (id, team_id, r2_key, content_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(imageId, teamId, key, file.type, c.get("userId"), now)
      .run();
  }
  return c.json({ id: teamId }, 201);
});

app.post("/robots/:id/images", requireAuth, async (c) => {
  const form = await c.req.formData();
  const files = form.getAll("images").filter((value): value is File => value instanceof File);
  const now = Date.now();
  for (const file of files.slice(0, 20)) {
    if (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) continue;
    const imageId = id("robot_image");
    const extension =
      file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
    const key = `robot-images/${c.req.param("id")}/${imageId}.${extension}`;
    await c.env.FIELD_MAPS.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
    await c.env.SCOUTING_DB.prepare(
      "INSERT INTO robot_images (id, team_id, r2_key, content_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(imageId, c.req.param("id"), key, file.type, c.get("userId"), now)
      .run();
  }
  await c.env.SCOUTING_DB.prepare("UPDATE robot_teams SET updated_at = ? WHERE id = ?")
    .bind(now, c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.get("/robots/images/:imageId", requireAuth, async (c) => {
  const image = await c.env.SCOUTING_DB.prepare(
    "SELECT r2_key, content_type FROM robot_images WHERE id = ?",
  )
    .bind(c.req.param("imageId"))
    .first<{ r2_key: string; content_type: string }>();
  if (!image) return c.json({ error: "Image not found." }, 404);
  const object = await c.env.FIELD_MAPS.get(image.r2_key);
  if (!object) return c.json({ error: "Image not found." }, 404);
  return new Response(object.body, {
    headers: { "Content-Type": image.content_type, "Cache-Control": "private, max-age=300" },
  });
});

app.delete("/robots/:id", requireAuth, async (c) => {
  const images = await c.env.SCOUTING_DB.prepare(
    "SELECT r2_key FROM robot_images WHERE team_id = ?",
  )
    .bind(c.req.param("id"))
    .all<{ r2_key: string }>();
  await Promise.all(images.results.map((image) => c.env.FIELD_MAPS.delete(image.r2_key)));
  await c.env.SCOUTING_DB.prepare("DELETE FROM robot_images WHERE team_id = ?")
    .bind(c.req.param("id"))
    .run();
  await c.env.SCOUTING_DB.prepare("DELETE FROM robot_teams WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.get("/operations", requireAuth, async (c) => {
  const admin = await isStrategyAdmin(c);
  const allowed = admin || (await isServiceHelper(c));
  if (!allowed) return c.json({ error: "Service crew access required." }, 403);
  const status = c.req.query("status") === "closed" ? "closed" : "active";
  const [rows, helpers, users] = await Promise.all([
    c.env.SCOUTING_DB.prepare(
      status === "closed"
        ? "SELECT * FROM service_tickets WHERE status = 'closed' ORDER BY updated_at DESC LIMIT 500"
        : "SELECT * FROM service_tickets WHERE status IN ('open', 'claimed') ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at DESC LIMIT 200",
    ).all<Record<string, unknown>>(),
    admin
      ? c.env.SCOUTING_DB.prepare("SELECT * FROM service_helpers ORDER BY display_name").all<
          Record<string, unknown>
        >()
      : Promise.resolve({ results: [] }),
    admin ? getG3IdUsers(c) : Promise.resolve([]),
  ]);
  return c.json({
    tickets: rows.results,
    helpers: helpers.results,
    users: users ?? [],
    isAdmin: admin,
  });
});

app.post("/service-tickets", requireAuth, async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const teamName = teamNumber(body.teamName);
  const issueType = text(body.issueType, 20);
  if (!teamName || !["mechanical", "electrical", "programming", "other"].includes(issueType))
    return c.json({ error: "A valid team number and issue type are required." }, 400);
  const ticketId = id("ticket");
  const now = Date.now();
  const eventLink = await resolveEventLink(c);
  await c.env.SCOUTING_DB.prepare(
    "INSERT INTO service_tickets (id, team_name, issue_type, description, status, created_by, created_by_name, created_at, updated_at, event_key, match_key, match_number) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      ticketId,
      teamName,
      issueType,
      text(body.description, 2000),
      c.get("userId"),
      c.get("userDisplayName"),
      now,
      now,
      eventLink.eventKey,
      eventLink.matchKey,
      eventLink.matchNumber,
    )
    .run();
  if (c.env.SLACK_BOT_TOKEN) {
    const helpers = await c.env.SCOUTING_DB.prepare(
      "SELECT slack_user_id FROM service_helpers WHERE slack_user_id IS NOT NULL",
    ).all<{ slack_user_id: string }>();
    await Promise.allSettled(
      helpers.results.map((helper) =>
        sendDM(
          helper.slack_user_id,
          `🔧 New ${issueType} service ticket for team ${teamName}: ${text(body.description, 500) || "No details provided."}\nOpen Event → Pit Scouting to claim it.`,
          { SLACK_BOT_TOKEN: c.env.SLACK_BOT_TOKEN as string },
        ),
      ),
    );
  }
  return c.json({ id: ticketId }, 201);
});

app.post("/team-comments", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c)) && !(await isServiceHelper(c)))
    return c.json({ error: "Service crew access required." }, 403);
  const body = await c.req.json<Record<string, unknown>>();
  const teamName = teamNumber(body.teamName);
  const comment = text(body.comment, 1000);
  if (!teamName || !comment)
    return c.json({ error: "A valid team number and comment are required." }, 400);
  const sourceTicketId = text(body.sourceTicketId, 200) || null;
  let eventKey: string | null = null;
  if (sourceTicketId) {
    const ticket = await c.env.SCOUTING_DB.prepare(
      "SELECT event_key FROM service_tickets WHERE id = ? AND team_name = ? AND status = 'closed'",
    )
      .bind(sourceTicketId, teamName)
      .first<{ event_key: string | null }>();
    if (!ticket) return c.json({ error: "Choose a closed ticket for this team." }, 400);
    eventKey = ticket.event_key;
  } else {
    eventKey = (await resolveEventLink(c)).eventKey || null;
  }
  const commentId = id("team_comment");
  await c.env.SCOUTING_DB.prepare(
    "INSERT INTO team_comments (id, team_name, comment, event_key, source_ticket_id, created_by, created_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      commentId,
      teamName,
      comment,
      eventKey,
      sourceTicketId,
      c.get("userId"),
      c.get("userDisplayName"),
      Date.now(),
    )
    .run();
  return c.json({ id: commentId }, 201);
});

app.put("/service-tickets/:id", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c)) && !(await isServiceHelper(c)))
    return c.json({ error: "Service crew access required." }, 403);
  const body = await c.req.json<Record<string, unknown>>();
  const action = text(body.action, 20);
  if (action === "claim")
    await c.env.SCOUTING_DB.prepare(
      "UPDATE service_tickets SET status = 'claimed', claimed_by = ?, claimed_by_name = ?, updated_at = ? WHERE id = ? AND status = 'open'",
    )
      .bind(c.get("userId"), c.get("userDisplayName"), Date.now(), c.req.param("id"))
      .run();
  else if (action === "close") {
    const resolution = text(body.resolution, 2000);
    if (!resolution) return c.json({ error: "A closure comment is required." }, 400);
    await c.env.SCOUTING_DB.prepare(
      "UPDATE service_tickets SET status = 'closed', resolution = ?, updated_at = ? WHERE id = ?",
    )
      .bind(resolution, Date.now(), c.req.param("id"))
      .run();
  } else return c.json({ error: "Unknown action." }, 400);
  return c.json({ ok: true });
});

app.post("/service-helpers", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  const body = await c.req.json<Record<string, unknown>>();
  const users = await getG3IdUsers(c);
  const user = users?.find((item) => item.id === text(body.userId, 200));
  if (!user) return c.json({ error: "Select an active G3ID user." }, 400);
  await c.env.SCOUTING_DB.prepare(
    "INSERT OR REPLACE INTO service_helpers (user_id, display_name, email, slack_user_id, skills_json, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      user.id,
      user.displayName,
      user.email,
      user.slackUserId ?? null,
      JSON.stringify(stringArray(body.skills, 10)),
      c.get("userId"),
      Date.now(),
    )
    .run();
  return c.json({ ok: true }, 201);
});

app.delete("/service-helpers/:id", requireAuth, async (c) => {
  if (!(await isStrategyAdmin(c))) return c.json({ error: "Strategy lead access required." }, 403);
  await c.env.SCOUTING_DB.prepare("DELETE FROM service_helpers WHERE user_id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

const worker = new Hono<AppEnv>().route("/scouting", app);

export type ScoutingApp = typeof worker;
export default worker;
