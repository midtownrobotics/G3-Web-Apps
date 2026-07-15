import { Hono } from "hono";
import {
  drawingExistsInR2,
  exportDrawingAsPDF,
  getDrawingExportParams,
  retrieveDrawingFromR2,
  storeDrawingInR2,
} from "../lib/onshape-export";
import type { AppEnv } from "../types";

const router = new Hono<AppEnv>();

const handleDrawingRequest = async (c: any) => {
  try {
    const partNumber = c.req.param("partNumber");

    if (!partNumber) {
      return c.json({ error: "Missing required parameter: partNumber" }, 400);
    }

    let pdfBuffer: ArrayBuffer;

    // Check if drawing exists in R2
    const exists = await drawingExistsInR2(partNumber, c.env);

    if (exists) {
      console.log("[OnShape Export] Drawing found in R2, retrieving", { partNumber });
      pdfBuffer = await retrieveDrawingFromR2(partNumber, c.env);
    } else {
      console.log("[OnShape Export] Drawing not in R2, exporting from OnShape", { partNumber });
      // Get export params and export from OnShape
      const params = await getDrawingExportParams(partNumber, c.env);
      pdfBuffer = await exportDrawingAsPDF(params.documentId, params.versionId, params.drawingEntityId, c.env);
      // Store in R2 for future requests
      await storeDrawingInR2(partNumber, pdfBuffer, c.env);
    }

    return c.newResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=drawing.pdf",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("[OnShape Export Route Error]", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Failed to retrieve drawing" },
      500,
    );
  }
};

router.get("/drawings/export/:partNumber", handleDrawingRequest);

export const onshapeExportRouter = router;
