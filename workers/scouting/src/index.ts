import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireAuth } from "./middleware/auth";
import type { AppEnv } from "./types";

type Tier = { id: string; name: string; color: string; items: string[] };
type TierListInput = { name?: unknown; description?: unknown; tiers?: unknown };
const app = new Hono<AppEnv>();

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
app.get("/me", requireAuth, (c) =>
  c.json({
    userId: c.get("userId"),
    displayName: c.get("userDisplayName"),
    email: c.get("userEmail"),
    isAdmin: c.get("userIsAdmin"),
  }),
);

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

app.post("/field-maps", requireAuth, async (c) => {
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
  const map = await c.env.SCOUTING_DB.prepare("SELECT r2_key FROM field_maps WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ r2_key: string }>();
  if (!map) return c.json({ error: "Map not found." }, 404);
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
      text(form.get("team"), 120),
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

export type ScoutingApp = typeof app;
export default app;
