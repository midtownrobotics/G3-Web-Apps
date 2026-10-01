import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

/**
 * Prints a document on the shop printer through the edge box (workers/edge
 * → tunnel → CUPS on the box). Shop prints are always one-sided black and
 * white on the default printer. Body: the file (PDF or plain text); query:
 * `title`. Response: { ok, jobId } or { ok: false, error }.
 */
export const printRouter = new Hono<AppEnv>().post("/", requireAuth, async (c) => {
  try {
    const query = new URLSearchParams({
      title: c.req.query("title") ?? "Shop print",
      sides: "one-sided",
      color: "monochrome",
    });
    const res = await c.env.EDGE.fetch(
      new Request(`http://edge/print/jobs?${query}`, {
        method: "POST",
        headers: {
          cookie: c.req.header("Cookie") ?? "",
          "content-type": c.req.header("Content-Type") ?? "application/pdf",
        },
        body: c.req.raw.body,
      }),
    );
    const data = (await res.json()) as { ok?: boolean; jobId?: number; error?: string };
    if (!res.ok || !data.ok) {
      return c.json(
        { ok: false, error: data.error || "Print failed" },
        res.status >= 500 ? (res.status as 502 | 503) : 400,
      );
    }
    return c.json({ ok: true, jobId: String(data.jobId) });
  } catch (err) {
    console.error("[Print Error]", err);
    return c.json(
      { ok: false, error: err instanceof Error ? err.message : "Print request failed" },
      500,
    );
  }
});
