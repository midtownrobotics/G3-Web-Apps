import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { AppEnv } from "../types";

const router = new Hono<AppEnv>();

router.get("/parts/:partNumber/drawing", async (c) => {
  try {
    const partNumber = c.req.param("partNumber");

    if (!partNumber) {
      return c.json({ error: "Missing part number" }, 400);
    }

    // Verify part exists in database
    const db = drizzle(c.env.SHOP_DB, { schema });
    const part = await db
      .select()
      .from(schema.onshapeParts)
      .where(eq(schema.onshapeParts.partNumber, partNumber))
      .get();

    if (!part) {
      return c.json(
        {
          error: "Part not found",
          details: `No part with number "${partNumber}" exists in the system.`,
        },
        404,
      );
    }

    // Check if drawing exists in R2
    const r2Key = `drawings/${partNumber}.pdf`;
    const drawing = await c.env.DRAWINGS.head(r2Key);

    if (!drawing) {
      return c.json(
        {
          error: "Drawing not available",
          details: `Drawing for part "${partNumber}" has not been created yet. Please create a drawing in OnShape or upload one.`,
        },
        404,
      );
    }

    // Retrieve and return the drawing
    const file = await c.env.DRAWINGS.get(r2Key);
    if (!file) {
      return c.json(
        {
          error: "Drawing retrieval failed",
          details: "Could not retrieve the drawing from storage.",
        },
        500,
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    return c.newResponse(arrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=drawing.pdf",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("[Part Viewer Error]", err);
    return c.json(
      {
        error: "Internal server error",
        details: err instanceof Error ? err.message : "An unexpected error occurred",
      },
      500,
    );
  }
});

export const partViewerRouter = router;
