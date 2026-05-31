import { Hono } from "hono";
import { createShopDb } from "../db";
import { processes } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const processesRouter = new Hono<AppEnv>()
  .get("/", requireAuth, async (c) => {
    const db = createShopDb(c.env.SHOP_DB);
    const rows = await db.select().from(processes).all();
    return c.json(rows);
  })
  .post("/", requireAuth, async (c) => {
    const { name } = await c.req.json<{ name: string }>();
    if (!name) return c.json({ error: "name is required." }, 400);

    const db = createShopDb(c.env.SHOP_DB);
    const row = await db
      .insert(processes)
      .values({ name, createdAt: Date.now() })
      .returning()
      .get();

    return c.json(row, 201);
  });