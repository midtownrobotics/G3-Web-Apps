import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
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

    // Generate R2 key
    const timestamp = Date.now();
    const r2Key = `drawings/${partNumber}/${timestamp}-${fileObj.name}`;

    // Upload to R2
    const arrayBuffer = await fileObj.arrayBuffer();
    await c.env.DRAWINGS.put(r2Key, arrayBuffer, {
      httpMetadata: {
        contentType: "application/pdf",
      },
    });

    // Generate R2 public URL
    const r2Url = `https://drawings.shop.g3robotics.com/${r2Key}`;

    // Store in database
    const db = drizzle(c.env.SHOP_DB, { schema });
    const now = Math.floor(Date.now() / 1000);

    await db.insert(schema.drawings).values({
      partNumber,
      filename: fileObj.name,
      r2Url,
      r2Key,
      fileSize: fileObj.size,
      uploadedBy: uploadedBy || "unknown",
      createdAt: now,
    });

    return c.json({
      success: true,
      url: r2Url,
      filename: fileObj.name,
      partNumber,
    });
  } catch (err) {
    console.error("[Drawing Upload Error]", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      500,
    );
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
    return c.json(
      { error: err instanceof Error ? err.message : "Failed to list drawings" },
      500,
    );
  }
});

export const drawingsRouter = router;
