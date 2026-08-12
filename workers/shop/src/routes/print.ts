import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const printRouter = new Hono<AppEnv>().post("/", requireAuth, async (c) => {
  try {
    const body = await c.req.arrayBuffer();
    const query = c.req.query();

    const qs = new URLSearchParams(query).toString();
    const url = `https://shoppi-print.g3robotics.com/print${qs ? `?${qs}` : ""}`;

    const printToken = c.env.PRINT_TOKEN || "";
    const printRes = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/pdf",
        authorization: `Bearer ${printToken}`,
      },
      body,
    });

    const printData = (await printRes.json()) as {
      ok: boolean;
      jobId?: string;
      bytes?: number;
      error?: string;
    };

    if (!printData.ok) {
      return c.json({ ok: false, error: printData.error || "Print failed" }, 400);
    }

    return c.json(printData);
  } catch (err) {
    console.error("[Print Proxy Error]", err);
    return c.json(
      { ok: false, error: err instanceof Error ? err.message : "Print request failed" },
      500,
    );
  }
});
