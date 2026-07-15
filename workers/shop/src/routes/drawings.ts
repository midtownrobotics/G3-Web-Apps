import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import * as schema from "../db/schema";
import type { AppEnv } from "../types";

const router = new Hono<AppEnv>();

router.post("/upload", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as unknown;
    const partNumber = formData.get("partNumber") as string;
    const uploadedBy = formData.get("uploadedBy") as string;

    if (!file || typeof file !== "object" || !("arrayBuffer" in file) || !partNumber) {
      return c.json({ error: "Missing file or partNumber" }, 400);
    }

    const fileObj = file as File;
    if (!fileObj.type.includes("pdf")) {
      return c.json({ error: "Only PDF files are supported" }, 400);
    }

    // Use standard R2 key that matches OnShape export location
    const r2Key = `drawings/${partNumber}.pdf`;

    // Upload to R2 (overwrites any existing drawing)
    const arrayBuffer = await fileObj.arrayBuffer();
    console.log("[Drawing Upload] Uploading to R2", { r2Key, size: arrayBuffer.byteLength });
    await c.env.DRAWINGS.put(r2Key, arrayBuffer, {
      httpMetadata: {
        contentType: "application/pdf",
      },
    });
    console.log("[Drawing Upload] Successfully uploaded to R2");

    // Store in database
    const db = drizzle(c.env.SHOP_DB, { schema });
    const now = Math.floor(Date.now() / 1000);

    const result = await db
      .insert(schema.drawings)
      .values({
        partNumber,
        filename: fileObj.name,
        r2Key,
        fileSize: fileObj.size,
        uploadedBy: uploadedBy || "unknown",
        createdAt: now,
      })
      .returning({ id: schema.drawings.id });

    const drawingId = result[0]?.id;
    if (!drawingId) {
      throw new Error("Failed to get drawing ID");
    }

    return c.json({
      success: true,
      id: drawingId,
      filename: fileObj.name,
      partNumber,
    });
  } catch (err) {
    console.error("[Drawing Upload Error]", err);
    return c.json({ error: err instanceof Error ? err.message : "Upload failed" }, 500);
  }
});

router.get("/list/:partNumber", async (c) => {
  try {
    const partNumber = c.req.param("partNumber");
    const db = drizzle(c.env.SHOP_DB, { schema });

    const drawings = await db
      .select()
      .from(schema.drawings)
      .where(eq(schema.drawings.partNumber, partNumber))
      .orderBy(schema.drawings.createdAt);

    return c.json({ drawings });
  } catch (err) {
    console.error("[Drawing List Error]", err);
    return c.json({ error: err instanceof Error ? err.message : "Failed to list drawings" }, 500);
  }
});

router.get("/:drawingId/download", async (c) => {
  try {
    const drawingId = Number.parseInt(c.req.param("drawingId"), 10);
    const db = drizzle(c.env.SHOP_DB, { schema });

    const drawing = await db
      .select()
      .from(schema.drawings)
      .where(eq(schema.drawings.id, drawingId))
      .get();

    if (!drawing) {
      return c.json({ error: "Drawing not found" }, 404);
    }

    // Fetch file from R2
    const file = await c.env.DRAWINGS.get(drawing.r2Key);
    if (!file) {
      return c.json({ error: "File not found in storage" }, 404);
    }

    // Stream the file with proper headers
    const arrayBuffer = await file.arrayBuffer();
    return c.newResponse(arrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${drawing.filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[Drawing Download Error]", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Failed to download drawing" },
      500,
    );
  }
});

export const drawingsRouter = router;
