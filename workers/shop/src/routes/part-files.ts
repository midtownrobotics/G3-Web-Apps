import { type SQLWrapper, and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { validator } from "hono/validator";
import { createShopDb } from "../db";
import { files, partFileLinks } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

// Cloudflare rejects request bodies over 100 MB before they reach the worker anyway.
const MAX_FILE_BYTES = 100 * 1024 * 1024;

type ShopDb = ReturnType<typeof createShopDb>;
type FileRow = typeof files.$inferSelect;
export type PartFileLink = { partNumber: string; revision: string };
export type PartFileWithLinks = Omit<FileRow, "r2Key"> & { links: PartFileLink[] };

const denyKiosk = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("sessionType") === "pin") {
    return c.json({ error: "Kiosks can't change files." }, 403);
  }
  await next();
});

const linkValidator = validator("json", (value, c): PartFileLink => {
  const v = (value ?? {}) as { partNumber?: unknown; revision?: unknown };
  const partNumber = typeof v.partNumber === "string" ? v.partNumber.trim() : "";
  const revision = typeof v.revision === "string" ? v.revision.trim() : "";
  if (!partNumber || !revision) {
    return c.json({ error: "partNumber and revision are required." }, 400) as never;
  }
  return { partNumber, revision };
});

function safeKeySegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "_";
}

/** Attaches each file's links. `fileIds` may be a subquery, which avoids D1's bound-param cap. */
async function withLinks(
  db: ShopDb,
  rows: FileRow[],
  fileIds?: number[] | SQLWrapper,
): Promise<PartFileWithLinks[]> {
  if (rows.length === 0) return [];
  const links = await db
    .select()
    .from(partFileLinks)
    .where(fileIds ? inArray(partFileLinks.fileId, fileIds) : undefined)
    .orderBy(asc(partFileLinks.partNumber), asc(partFileLinks.revision))
    .all();
  const byFile = new Map<number, PartFileLink[]>();
  for (const l of links) {
    const list = byFile.get(l.fileId) ?? [];
    list.push({ partNumber: l.partNumber, revision: l.revision });
    byFile.set(l.fileId, list);
  }
  return rows.map(({ r2Key: _r2Key, ...f }) => ({ ...f, links: byFile.get(f.id) ?? [] }));
}

async function getFileWithLinks(db: ShopDb, id: number): Promise<PartFileWithLinks | null> {
  const row = await db.select().from(files).where(eq(files.id, id)).get();
  if (!row) return null;
  const [withL] = await withLinks(db, [row], [id]);
  return withL;
}

export const partFilesRouter = new Hono<AppEnv>()
  // All files, or only those linked to ?partNumber=&revision=. Each includes every link it has.
  .get("/", requireAuth, async (c) => {
    const partNumber = c.req.query("partNumber");
    const revision = c.req.query("revision");
    const db = createShopDb(c.env.SHOP_DB);

    if (partNumber === undefined && revision === undefined) {
      const rows = await db.select().from(files).orderBy(desc(files.createdAt)).all();
      return c.json(await withLinks(db, rows));
    }

    const filters = [];
    if (partNumber !== undefined) filters.push(eq(partFileLinks.partNumber, partNumber));
    if (revision !== undefined) filters.push(eq(partFileLinks.revision, revision));
    const linkedIds = db
      .select({ id: partFileLinks.fileId })
      .from(partFileLinks)
      .where(and(...filters));

    const rows = await db
      .select()
      .from(files)
      .where(inArray(files.id, linkedIds))
      .orderBy(desc(files.createdAt))
      .all();
    return c.json(await withLinks(db, rows, linkedIds));
  })
  // Multipart upload. Every file starts linked to one part revision, so none are orphaned.
  .post("/", requireAuth, denyKiosk, async (c) => {
    const form = await c.req.formData();
    // Workers' FormData typings omit File, but multipart file fields arrive as File objects.
    const file = form.get("file") as unknown as File | string | null;
    const partNumber = String(form.get("partNumber") ?? "").trim();
    const revision = String(form.get("revision") ?? "").trim();

    if (!file || typeof file === "string" || file.size === 0) {
      return c.json({ error: "A non-empty file is required." }, 400);
    }
    if (!partNumber || !revision) {
      return c.json({ error: "partNumber and revision are required." }, 400);
    }
    if (file.size > MAX_FILE_BYTES) {
      return c.json({ error: "Files must be 100 MB or smaller." }, 413);
    }

    const contentType = file.type || "application/octet-stream";
    const r2Key = `part-files/${crypto.randomUUID()}-${safeKeySegment(file.name)}`;
    await c.env.DRAWINGS.put(r2Key, file.stream(), { httpMetadata: { contentType } });

    const db = createShopDb(c.env.SHOP_DB);
    const userId = c.get("userId");
    const now = Date.now();
    try {
      const row = await db
        .insert(files)
        .values({
          filename: file.name,
          r2Key,
          contentType,
          fileSize: file.size,
          uploadedBy: userId,
          createdAt: now,
        })
        .returning()
        .get();
      await db
        .insert(partFileLinks)
        .values({ fileId: row.id, partNumber, revision, linkedBy: userId, createdAt: now });
      return c.json(await getFileWithLinks(db, row.id), 201);
    } catch (err) {
      await c.env.DRAWINGS.delete(r2Key);
      await db.delete(files).where(eq(files.r2Key, r2Key));
      throw err;
    }
  })
  .get("/:id/download", requireAuth, async (c) => {
    const id = Number(c.req.param("id"));
    const db = createShopDb(c.env.SHOP_DB);
    const row = await db.select().from(files).where(eq(files.id, id)).get();
    if (!row) return c.json({ error: "File not found." }, 404);

    const object = await c.env.DRAWINGS.get(row.r2Key);
    if (!object) return c.json({ error: "File is missing from storage." }, 404);

    const asciiName = row.filename.replace(/[^\x20-\x7e]|"/g, "_");
    return new Response(object.body, {
      headers: {
        "Content-Type": row.contentType,
        "Content-Length": String(object.size),
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  })
  .post("/:id/links", requireAuth, denyKiosk, linkValidator, async (c) => {
    const id = Number(c.req.param("id"));
    const { partNumber, revision } = c.req.valid("json");
    const db = createShopDb(c.env.SHOP_DB);

    const exists = await db.select({ id: files.id }).from(files).where(eq(files.id, id)).get();
    if (!exists) return c.json({ error: "File not found." }, 404);

    await db
      .insert(partFileLinks)
      .values({
        fileId: id,
        partNumber,
        revision,
        linkedBy: c.get("userId"),
        createdAt: Date.now(),
      })
      .onConflictDoNothing();
    return c.json(await getFileWithLinks(db, id));
  })
  // Unlinks one part revision. Removing the last link deletes the file itself.
  .delete("/:id/links", requireAuth, denyKiosk, linkValidator, async (c) => {
    const id = Number(c.req.param("id"));
    const { partNumber, revision } = c.req.valid("json");
    const db = createShopDb(c.env.SHOP_DB);

    const row = await db.select().from(files).where(eq(files.id, id)).get();
    if (!row) return c.json({ error: "File not found." }, 404);

    await db
      .delete(partFileLinks)
      .where(
        and(
          eq(partFileLinks.fileId, id),
          eq(partFileLinks.partNumber, partNumber),
          eq(partFileLinks.revision, revision),
        ),
      );

    const remaining = await db
      .select({ n: count() })
      .from(partFileLinks)
      .where(eq(partFileLinks.fileId, id))
      .get();
    if ((remaining?.n ?? 0) > 0) return c.json({ deleted: false });

    await c.env.DRAWINGS.delete(row.r2Key);
    await db.delete(files).where(eq(files.id, id));
    return c.json({ deleted: true });
  })
  // Deletes the file everywhere, including all of its links.
  .delete("/:id", requireAuth, denyKiosk, async (c) => {
    const id = Number(c.req.param("id"));
    const db = createShopDb(c.env.SHOP_DB);
    const row = await db.select().from(files).where(eq(files.id, id)).get();
    if (!row) return c.json({ error: "File not found." }, 404);

    await c.env.DRAWINGS.delete(row.r2Key);
    await db.batch([
      db.delete(partFileLinks).where(eq(partFileLinks.fileId, id)),
      db.delete(files).where(eq(files.id, id)),
    ]);
    return c.json({ ok: true });
  });
