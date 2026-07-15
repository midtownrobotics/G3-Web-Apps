import { Hono } from "hono";
import { exportDrawingAsPDF, getDrawingExportParams } from "../lib/onshape-export";
import type { AppEnv } from "../types";

const router = new Hono<AppEnv>();

router.get("/drawings/export/:partNumber", async (c) => {
  try {
    const partNumber = c.req.param("partNumber");

    if (!partNumber) {
      return c.json({ error: "Missing required parameter: partNumber" }, 400);
    }

    const params = await getDrawingExportParams(partNumber, c.env);
    const pdfBuffer = await exportDrawingAsPDF(params.documentId, params.versionId, params.drawingEntityId, c.env);

    return c.newResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=drawing.pdf",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[OnShape Export Route Error]", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Failed to export drawing" },
      500,
    );
  }
});

export const onshapeExportRouter = router;
