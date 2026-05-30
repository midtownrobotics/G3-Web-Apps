import { eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { validator } from "hono/validator";
import { createDb } from "./db";
import { checklistIssues, checklistItems, checklistLists } from "./db/schema";
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

const itemBodyValidator = validator("json", (value, c) => {
  const v = value as { name?: unknown; description?: unknown; type?: unknown };
  if (typeof v.name !== "string" || !v.name.trim())
    return c.json({ error: "name must be a non-empty string." }, 400);
  if (v.description !== undefined && v.description !== null && typeof v.description !== "string")
    return c.json({ error: "description must be a string or null." }, 400);
  if (v.type !== undefined && v.type !== "item" && v.type !== "topic")
    return c.json({ error: "type must be 'item' or 'topic'." }, 400);
  return {
    name: v.name.trim(),
    description: (typeof v.description === "string" ? v.description : null) as string | null,
    type: ((v.type as string) ?? "item") as "item" | "topic",
  };
});

const checkedValidator = validator("json", (value, c) => {
  const v = value as { checked?: unknown };
  if (typeof v.checked !== "boolean") return c.json({ error: "checked must be a boolean." }, 400);
  return { checked: v.checked };
});

const issueTextValidator = validator("json", (value, c) => {
  const v = value as { text?: unknown };
  if (typeof v.text !== "string" || !v.text.trim())
    return c.json({ error: "text must be a non-empty string." }, 400);
  return { text: v.text.trim() };
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

// Shared select shape for list queries — counts only checkable items (type = 'item')
const listSelect = {
  id: checklistLists.id,
  name: checklistLists.name,
  description: checklistLists.description,
  createdAt: checklistLists.createdAt,
  itemCount: sql<number>`count(case when ${checklistItems.type} = 'item' then 1 end)`,
  checkedCount: sql<number>`count(case when ${checklistItems.type} = 'item' and ${checklistItems.checked} = 1 then 1 end)`,
};

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
      .select(listSelect)
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
      .select(listSelect)
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

  // Issues — reads (all)
  .get("/issues", async (c) => {
    const db = createDb(c.env.PIT_DB);
    const issues = await db
      .select({
        id: checklistIssues.id,
        itemId: checklistIssues.itemId,
        itemName: checklistItems.name,
        listId: checklistLists.id,
        listName: checklistLists.name,
        text: checklistIssues.text,
        createdAt: checklistIssues.createdAt,
      })
      .from(checklistIssues)
      .innerJoin(checklistItems, eq(checklistIssues.itemId, checklistItems.id))
      .innerJoin(checklistLists, eq(checklistItems.listId, checklistLists.id))
      .orderBy(checklistIssues.createdAt);
    return c.json(issues);
  })

  // Issues — reads (per list)
  .get("/lists/:id/issues", async (c) => {
    const listId = parseId(c.req.param("id"));
    if (!listId) return c.json({ error: "Invalid id." }, 400);

    const db = createDb(c.env.PIT_DB);
    const [list] = await db.select().from(checklistLists).where(eq(checklistLists.id, listId));
    if (!list) return c.json({ error: "List not found." }, 404);

    const issues = await db
      .select({
        id: checklistIssues.id,
        itemId: checklistIssues.itemId,
        text: checklistIssues.text,
        createdAt: checklistIssues.createdAt,
      })
      .from(checklistIssues)
      .innerJoin(checklistItems, eq(checklistIssues.itemId, checklistItems.id))
      .where(eq(checklistItems.listId, listId))
      .orderBy(checklistIssues.createdAt);
    return c.json(issues);
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

    const itemIds = (
      await db
        .select({ id: checklistItems.id })
        .from(checklistItems)
        .where(eq(checklistItems.listId, id))
    ).map((i) => i.id);

    if (itemIds.length > 0) {
      await db.delete(checklistIssues).where(inArray(checklistIssues.itemId, itemIds));
    }
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

  .post("/lists/:id/items", requireAuth, itemBodyValidator, async (c) => {
    const listId = parseId(c.req.param("id"));
    if (!listId) return c.json({ error: "Invalid list id." }, 400);

    const { name, description, type } = c.req.valid("json");
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
      .values({ listId, index, type, name, description, createdAt: now });
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

    await db.delete(checklistIssues).where(eq(checklistIssues.itemId, itemId));
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
  )

  // Checked state — no auth required (runner is public)
  .patch("/lists/:id/items/:itemId/checked", checkedValidator, async (c) => {
    const listId = parseId(c.req.param("id"));
    const itemId = parseId(c.req.param("itemId"));
    if (!listId || !itemId) return c.json({ error: "Invalid id." }, 400);

    const { checked } = c.req.valid("json");
    const db = createDb(c.env.PIT_DB);
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId));
    if (!item || item.listId !== listId) return c.json({ error: "Item not found." }, 404);

    await db.update(checklistItems).set({ checked }).where(eq(checklistItems.id, itemId));
    const [updated] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId));
    return c.json(updated);
  })

  .post("/lists/:id/reset", async (c) => {
    const listId = parseId(c.req.param("id"));
    if (!listId) return c.json({ error: "Invalid id." }, 400);

    const db = createDb(c.env.PIT_DB);
    const [list] = await db.select().from(checklistLists).where(eq(checklistLists.id, listId));
    if (!list) return c.json({ error: "List not found." }, 404);

    await db
      .update(checklistItems)
      .set({ checked: false })
      .where(eq(checklistItems.listId, listId));
    return c.json({ success: true });
  })

  // Issues — no auth required (runner is public)
  .post("/lists/:id/items/:itemId/issues", issueTextValidator, async (c) => {
    const listId = parseId(c.req.param("id"));
    const itemId = parseId(c.req.param("itemId"));
    if (!listId || !itemId) return c.json({ error: "Invalid id." }, 400);

    const { text } = c.req.valid("json");
    const db = createDb(c.env.PIT_DB);
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId));
    if (!item || item.listId !== listId) return c.json({ error: "Item not found." }, 404);

    const now = Math.floor(Date.now() / 1000);
    const result = await db.insert(checklistIssues).values({ itemId, text, createdAt: now });
    const [created] = await db
      .select()
      .from(checklistIssues)
      .where(eq(checklistIssues.id, Number(result.meta.last_row_id)));
    return c.json(created, 201);
  })

  .delete("/lists/:id/items/:itemId/issues/:issueId", async (c) => {
    const listId = parseId(c.req.param("id"));
    const itemId = parseId(c.req.param("itemId"));
    const issueId = parseId(c.req.param("issueId"));
    if (!listId || !itemId || !issueId) return c.json({ error: "Invalid id." }, 400);

    const db = createDb(c.env.PIT_DB);
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId));
    if (!item || item.listId !== listId) return c.json({ error: "Item not found." }, 404);

    const [issue] = await db.select().from(checklistIssues).where(eq(checklistIssues.id, issueId));
    if (!issue || issue.itemId !== itemId) return c.json({ error: "Issue not found." }, 404);

    await db.delete(checklistIssues).where(eq(checklistIssues.id, issueId));
    return c.json({ success: true });
  })

  // Global reset — unchecks all items across all lists, preserves issues
  .post("/reset", async (c) => {
    const db = createDb(c.env.PIT_DB);
    await db.update(checklistItems).set({ checked: false });
    return c.json({ success: true });
  });

export type PitApp = typeof app;
export default app;
