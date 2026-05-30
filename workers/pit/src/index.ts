import { count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { validator } from "hono/validator";
import { createDb } from "./db";
import { checklistItems, checklistLists } from "./db/schema";
import { requireAuth } from "./middleware/auth";
import type { AppEnv } from "./types";

const base = new Hono<AppEnv>();

base.onError((err, c) => {
  console.error("[pit]", err);
  const message = err instanceof Error ? err.message : String(err);
  return c.json({ error: "Internal server error.", detail: message }, 500);
});

base.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      if (origin === "https://g3robotics.com") return origin;
      if (origin.endsWith(".g3robotics.com")) return origin;
      if (origin.startsWith("http://localhost:")) return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const listNameValidator = validator("json", (value, c) => {
  const v = value as { name?: unknown };
  if (typeof v.name !== "string" || !v.name.trim())
    return c.json({ error: "name must be a non-empty string." }, 400);
  return { name: v.name.trim() };
});

const listDescriptionValidator = validator("json", (value, c) => {
  const v = value as { description?: unknown };
  if (v.description !== null && typeof v.description !== "string")
    return c.json({ error: "description must be a string or null." }, 400);
  return { description: (v.description ?? null) as string | null };
});

const listBodyValidator = validator("json", (value, c) => {
  const v = value as { name?: unknown; description?: unknown };
  if (typeof v.name !== "string" || !v.name.trim())
    return c.json({ error: "name must be a non-empty string." }, 400);
  if (v.description !== undefined && v.description !== null && typeof v.description !== "string")
    return c.json({ error: "description must be a string or null." }, 400);
  return {
    name: v.name.trim(),
    description: (typeof v.description === "string" ? v.description : null) as string | null,
  };
});

const reorderValidator = validator("json", (value, c) => {
  const v = value as { ids?: unknown };
  if (
    !Array.isArray(v.ids) ||
    !v.ids.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0)
  )
    return c.json({ error: "ids must be an array of positive integers." }, 400);
  return { ids: v.ids as number[] };
});

const app = base
  .get("/health", (c) => c.json({ status: "ok", service: "pit" }))

  .get("/me", requireAuth, (c) =>
    c.json({
      id: c.get("userId"),
      isAdmin: c.get("userIsAdmin"),
      email: c.get("userEmail"),
      displayName: c.get("userDisplayName"),
    }),
  )

  // Lists — reads
  .get("/lists", async (c) => {
    const db = createDb(c.env.PIT_DB);
    const rows = await db
      .select({
        id: checklistLists.id,
        name: checklistLists.name,
        description: checklistLists.description,
        createdAt: checklistLists.createdAt,
        itemCount: count(checklistItems.id),
      })
      .from(checklistLists)
      .leftJoin(checklistItems, eq(checklistItems.listId, checklistLists.id))
      .groupBy(checklistLists.id);
    return c.json(rows);
  })

  .get("/lists/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid id." }, 400);

    const db = createDb(c.env.PIT_DB);
    const [row] = await db
      .select({
        id: checklistLists.id,
        name: checklistLists.name,
        description: checklistLists.description,
        createdAt: checklistLists.createdAt,
        itemCount: count(checklistItems.id),
      })
      .from(checklistLists)
      .leftJoin(checklistItems, eq(checklistItems.listId, checklistLists.id))
      .where(eq(checklistLists.id, id))
      .groupBy(checklistLists.id);
    if (!row) return c.json({ error: "List not found." }, 404);
    return c.json(row);
  })

  // Items — reads
  .get("/lists/:id/items", async (c) => {
    const listId = parseId(c.req.param("id"));
    if (!listId) return c.json({ error: "Invalid id." }, 400);

    const db = createDb(c.env.PIT_DB);
    const [list] = await db.select().from(checklistLists).where(eq(checklistLists.id, listId));
    if (!list) return c.json({ error: "List not found." }, 404);

    const items = await db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.listId, listId))
      .orderBy(checklistItems.index);
    return c.json(items);
  })

  // Lists — writes
  .post("/lists", requireAuth, listBodyValidator, async (c) => {
    const { name, description } = c.req.valid("json");
    const db = createDb(c.env.PIT_DB);
    const now = Math.floor(Date.now() / 1000);
    const result = await db.insert(checklistLists).values({ name, description, createdAt: now });
    const [created] = await db
      .select()
      .from(checklistLists)
      .where(eq(checklistLists.id, Number(result.meta.last_row_id)));
    return c.json(created, 201);
  })

  .delete("/lists/:id", requireAuth, async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid id." }, 400);

    const db = createDb(c.env.PIT_DB);
    const [existing] = await db.select().from(checklistLists).where(eq(checklistLists.id, id));
    if (!existing) return c.json({ error: "List not found." }, 404);

    await db.delete(checklistItems).where(eq(checklistItems.listId, id));
    await db.delete(checklistLists).where(eq(checklistLists.id, id));
    return c.json({ success: true });
  })

  .patch("/lists/:id/name", requireAuth, listNameValidator, async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid id." }, 400);

    const { name } = c.req.valid("json");
    const db = createDb(c.env.PIT_DB);
    const [existing] = await db.select().from(checklistLists).where(eq(checklistLists.id, id));
    if (!existing) return c.json({ error: "List not found." }, 404);

    await db.update(checklistLists).set({ name }).where(eq(checklistLists.id, id));
    const [updated] = await db.select().from(checklistLists).where(eq(checklistLists.id, id));
    return c.json(updated);
  })

  .patch("/lists/:id/description", requireAuth, listDescriptionValidator, async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid id." }, 400);

    const { description } = c.req.valid("json");
    const db = createDb(c.env.PIT_DB);
    const [existing] = await db.select().from(checklistLists).where(eq(checklistLists.id, id));
    if (!existing) return c.json({ error: "List not found." }, 404);

    await db.update(checklistLists).set({ description }).where(eq(checklistLists.id, id));
    const [updated] = await db.select().from(checklistLists).where(eq(checklistLists.id, id));
    return c.json(updated);
  })

  // Items — writes
  .patch("/lists/:id/items/reorder", requireAuth, reorderValidator, async (c) => {
    const listId = parseId(c.req.param("id"));
    if (!listId) return c.json({ error: "Invalid id." }, 400);

    const { ids } = c.req.valid("json");
    const db = createDb(c.env.PIT_DB);

    const existing = await db
      .select({ id: checklistItems.id })
      .from(checklistItems)
      .where(eq(checklistItems.listId, listId));

    const existingIds = new Set(existing.map((i) => i.id));
    if (ids.length !== existingIds.size || !ids.every((id) => existingIds.has(id)))
      return c.json({ error: "ids must contain every item in the list exactly once." }, 400);

    for (let i = 0; i < ids.length; i++) {
      await db.update(checklistItems).set({ index: i }).where(eq(checklistItems.id, ids[i]));
    }
    return c.json({ success: true });
  })

  .post("/lists/:id/items", requireAuth, listBodyValidator, async (c) => {
    const listId = parseId(c.req.param("id"));
    if (!listId) return c.json({ error: "Invalid list id." }, 400);

    const { name, description } = c.req.valid("json");
    const db = createDb(c.env.PIT_DB);
    const [list] = await db.select().from(checklistLists).where(eq(checklistLists.id, listId));
    if (!list) return c.json({ error: "List not found." }, 404);

    const existing = await db
      .select({ id: checklistItems.id })
      .from(checklistItems)
      .where(eq(checklistItems.listId, listId));
    const index = existing.length;

    const now = Math.floor(Date.now() / 1000);
    const result = await db
      .insert(checklistItems)
      .values({ listId, index, name, description, createdAt: now });
    const [created] = await db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.id, Number(result.meta.last_row_id)));
    return c.json(created, 201);
  })

  .delete("/lists/:id/items/:itemId", requireAuth, async (c) => {
    const listId = parseId(c.req.param("id"));
    const itemId = parseId(c.req.param("itemId"));
    if (!listId || !itemId) return c.json({ error: "Invalid id." }, 400);

    const db = createDb(c.env.PIT_DB);
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId));
    if (!item || item.listId !== listId) return c.json({ error: "Item not found." }, 404);

    await db.delete(checklistItems).where(eq(checklistItems.id, itemId));
    return c.json({ success: true });
  })

  .patch("/lists/:id/items/:itemId/name", requireAuth, listNameValidator, async (c) => {
    const listId = parseId(c.req.param("id"));
    const itemId = parseId(c.req.param("itemId"));
    if (!listId || !itemId) return c.json({ error: "Invalid id." }, 400);

    const { name } = c.req.valid("json");
    const db = createDb(c.env.PIT_DB);
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId));
    if (!item || item.listId !== listId) return c.json({ error: "Item not found." }, 404);

    await db.update(checklistItems).set({ name }).where(eq(checklistItems.id, itemId));
    const [updated] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId));
    return c.json(updated);
  })

  .patch(
    "/lists/:id/items/:itemId/description",
    requireAuth,
    listDescriptionValidator,
    async (c) => {
      const listId = parseId(c.req.param("id"));
      const itemId = parseId(c.req.param("itemId"));
      if (!listId || !itemId) return c.json({ error: "Invalid id." }, 400);

      const { description } = c.req.valid("json");
      const db = createDb(c.env.PIT_DB);
      const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId));
      if (!item || item.listId !== listId) return c.json({ error: "Item not found." }, 404);

      await db.update(checklistItems).set({ description }).where(eq(checklistItems.id, itemId));
      const [updated] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId));
      return c.json(updated);
    },
  );

export type PitApp = typeof app;
export default app;
