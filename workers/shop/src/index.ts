import type { MessageBatch } from "@cloudflare/workers-types";
import { sendMessage } from "@g3/slack";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createShopDb } from "./db";
import { type BOMQueueMessage, processBOMQueue } from "./lib/bom-queue-consumer";
import { requireAuth } from "./middleware/auth";
import { actionsRouter } from "./routes/actions";
import { adminPartsRouter } from "./routes/admin-parts";
import { drawingsRouter } from "./routes/drawings";
import { clearPresence, kioskPresenceRouter } from "./routes/kiosk-presence";
import { onshapeExportRouter } from "./routes/onshape-export";
import { onshapeWebhooksRouter } from "./routes/onshape-webhooks";
import { partDefinitionsRouter } from "./routes/part-definitions";
import { partInstanceProcessesRouter } from "./routes/part-instance-processes";
import { partInstancesRouter } from "./routes/part-instances";
import { partViewerRouter } from "./routes/part-viewer";
import { processesRouter } from "./routes/processes";
import { subsystemsRouter } from "./routes/subsystems";
import type { AppEnv } from "./types";

const base = new Hono<AppEnv>();

base.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error." }, 500);
});

base.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      if (origin === "https://g3robotics.com") return origin;
      if (origin.endsWith(".g3robotics.com")) return origin;
      if (origin.startsWith("http://localhost:")) return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

const app = base
  .get("/health", (c) => c.json({ status: "ok", service: "shop" }))
  .get("/me", requireAuth, (c) =>
    c.json({
      userId: c.get("userId"),
      isAdmin: c.get("userIsAdmin"),
      email: c.get("userEmail"),
      displayName: c.get("userDisplayName"),
      sessionType: c.get("sessionType"),
      kioskDeviceId: c.get("kioskDeviceId"),
      kioskDeviceName: c.get("kioskDeviceName"),
    }),
  )
  .route("/drawings", drawingsRouter)
  .route("/onshape", onshapeExportRouter)
  .route("", partViewerRouter)
  // Proxy logout to g3id so the shop app can end sessions (and clean up kiosk
  // presence) without talking to the g3id worker directly.
  .post("/logout", requireAuth, async (c) => {
    const kioskDeviceId = c.get("kioskDeviceId");
    if (c.get("sessionType") === "pin" && kioskDeviceId) {
      await clearPresence(createShopDb(c.env.SHOP_DB), kioskDeviceId);
    }
    const res = await c.env.G3ID.fetch(
      new Request("http://g3id/auth/logout", {
        method: "POST",
        headers: { cookie: c.req.header("Cookie") ?? "" },
      }),
    );
    // Forward the session-clearing cookie from g3id to the browser.
    const setCookie = res.headers.get("Set-Cookie");
    if (setCookie) c.header("Set-Cookie", setCookie);
    return c.json({ ok: true });
  })
  // Resolve user IDs (e.g. part creators) to display names via g3id.
  .get("/users", requireAuth, async (c) => {
    const ids = c.req.query("ids") ?? "";
    const res = await c.env.G3ID.fetch(
      new Request(`http://g3id/auth/users?ids=${encodeURIComponent(ids)}`, {
        headers: { cookie: c.req.header("Cookie") ?? "" },
      }),
    );
    if (!res.ok) return c.json({ error: "Failed to resolve users." }, 502);
    return c.json((await res.json()) as { id: string; displayName: string }[]);
  })
  .route("/onshape", onshapeWebhooksRouter)
  .route("/subsystems", subsystemsRouter)
  .route("/processes", processesRouter)
  .route("/part-definitions", partDefinitionsRouter)
  .route("/part-instances", partInstancesRouter)
  .route("/part-instance-processes", partInstanceProcessesRouter)
  .route("/actions", actionsRouter)
  .route("/kiosk-presence", kioskPresenceRouter)
  .route("/admin", adminPartsRouter)
  .get("/slack-test", async (c) => {
    c.executionCtx.waitUntil(sendMessage("C09QYMTSGKT", "test but now from shop sw worker", c.env));
    return c.text("200", 200);
  });

export type ShopApp = typeof app;

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<BOMQueueMessage>, env: AppEnv["Bindings"]) {
    for (const msg of batch.messages) {
      try {
        await processBOMQueue(msg.body, env);
        msg.ack();
      } catch (err) {
        console.error("[Queue] Error processing message:", err);
        msg.retry({ delaySeconds: 30 });
      }
    }
  },
};
