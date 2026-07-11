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

    return c.json({
      accessToken,
    });
  } catch (error) {
    return c.json({ error: "OnShape account not linked" }, 404);
  }
});

router.get("/proxy/:url", requireAuth, async (c) => {
  const userId = c.get("userId");

  if (typeof userId !== "string") {
    return c.json({ error: "Invalid user context" }, 400);
  }

  const url = c.req.param().url;

  try {
    const result = await onshapeRequest(userId, url, c.env);

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
