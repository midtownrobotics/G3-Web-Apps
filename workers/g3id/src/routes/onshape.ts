import { Hono } from "hono";
import { getValidOnshapeToken, onshapeRequest } from "../lib/onshape";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const router = new Hono<AppEnv>();

router.get("/token", requireAuth, async (c) => {
  const userId = c.get("userId");

  if (typeof userId !== "string") {
    return c.json({ error: "Invalid user context" }, 400);
  }

  try {
    const accessToken = await getValidOnshapeToken(userId, c.env);
    const now = Math.floor(Date.now() / 1000);

    return c.json({
      accessToken,
      expiresAt: now + 3600, // Approximate 1 hour expiry
    });
  } catch (error) {
    return c.json({ error: "OnShape account not linked" }, 404);
  }
});

router.post("/proxy", requireAuth, async (c) => {
  const userId = c.get("userId");

  if (typeof userId !== "string") {
    return c.json({ error: "Invalid user context" }, 400);
  }

  const body = (await c.req.json()) as {
    path: string;
    method?: string;
    body?: unknown;
  };

  if (!body.path) {
    return c.json({ error: "Missing path" }, 400);
  }

  try {
    const result = await onshapeRequest(userId, body.path, c.env, {
      method: body.method,
      body: body.body,
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not linked")) {
        return c.json({ error: "OnShape account not linked" }, 404);
      }
      return c.json({ error: error.message }, 500);
    }
    return c.json({ error: "Unknown error" }, 500);
  }
});

router.get("/test/profile", requireAuth, async (c) => {
  const userId = c.get("userId");

  if (typeof userId !== "string") {
    return c.json({ error: "Invalid user context" }, 400);
  }

  try {
    const result = await onshapeRequest(userId, "/users/sessioninfo", c.env);
    return c.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not linked")) {
        return c.json({ error: "OnShape account not linked" }, 404);
      }
      return c.json({ error: error.message }, 500);
    }
    return c.json({ error: "Unknown error" }, 500);
  }
});

export const onshapeRouter = router;
