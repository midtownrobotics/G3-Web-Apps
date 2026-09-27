import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { createShopDb } from "../db";
import { PROCESS_TYPES, type ProcessType, processes } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const isProcessType = (v: unknown): v is ProcessType =>
  typeof v === "string" && (PROCESS_TYPES as readonly string[]).includes(v);

const createProcessValidator = validator(
  "json",
  (value, c): { name: string; type: ProcessType } => {
    const v = (value ?? {}) as { name?: unknown; type?: unknown };
    const name = typeof v.name === "string" ? v.name.trim() : "";
    if (!name) return c.json({ error: "name is required." }, 400) as never;
    if (v.type !== undefined && !isProcessType(v.type)) {
      return c.json({ error: `type must be one of: ${PROCESS_TYPES.join(", ")}.` }, 400) as never;
    }
    return { name, type: v.type ?? "regular" };
  },
);

const updateProcessValidator = validator("json", (value, c): { type: ProcessType } => {
  const v = (value ?? {}) as { type?: unknown };
  if (!isProcessType(v.type)) {
    return c.json({ error: `type must be one of: ${PROCESS_TYPES.join(", ")}.` }, 400) as never;
  }
  return { type: v.type };
});

export const processesRouter = new Hono<AppEnv>()
  .get("/", requireAuth, async (c) => {
    const db = createShopDb(c.env.SHOP_DB);
    const rows = await db.select().from(processes).all();
    return c.json(rows);
  })
  .post("/", requireAuth, createProcessValidator, async (c) => {
    const { name, type } = c.req.valid("json");

    const db = createShopDb(c.env.SHOP_DB);
    const row = await db
      .insert(processes)
      .values({ name, type, createdAt: Date.now() })
      .returning()
      .get();

    return c.json(row, 201);
  })
  .patch("/:id", requireAuth, updateProcessValidator, async (c) => {
    const id = Number(c.req.param("id"));
    const { type } = c.req.valid("json");

    const db = createShopDb(c.env.SHOP_DB);
    const row = await db
      .update(processes)
      .set({ type })
      .where(eq(processes.id, id))
      .returning()
      .get();

    if (!row) return c.json({ error: "Process not found." }, 404);
    return c.json(row);
  });
