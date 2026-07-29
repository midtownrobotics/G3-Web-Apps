import { Hono } from "hono";
import type { AppEnv } from "../types";

const router = new Hono<AppEnv>();

router.get("/parts/:partNumber/drawing", async (c) => {
  try {
    const partNumber = c.req.param("partNumber");

    if (!partNumber) {
      return c.json({ error: "Missing part number" }, 400);
    }

    // Check if drawing exists in R2 (don't check if part is defined)
    const r2Key = `drawings/${partNumber}.pdf`;
    const file = await c.env.DRAWINGS.get(r2Key);

    if (!file) {
      return c.json(
        {
          error: "Drawing not available",
          details: `No cached drawing found for part "${partNumber}".`,
        },
        404,
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
