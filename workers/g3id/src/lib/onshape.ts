import { and, eq } from "drizzle-orm";
import { createDb } from "../db";
import { coreUserIdentities } from "../db/schema";
import type { AppEnv } from "../types";

export class OnshapeNotLinkedError extends Error {
  constructor(message = "OnShape account not linked") {
    super(message);
    this.name = "OnshapeNotLinkedError";
  }
}

export async function getValidOnshapeToken(userId: string, env: AppEnv["Bindings"]) {
  const db = createDb(env.DB);

  const identity = await db
    .select()
    .from(coreUserIdentities)
    .where(and(eq(coreUserIdentities.userId, userId), eq(coreUserIdentities.provider, "onshape")))
    .get();

  if (!identity) {
    throw new OnshapeNotLinkedError();
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = identity.tokenExpiresAt || 0;

  // Refresh if within 60 seconds of expiry
  if (expiresAt - now < 60) {
    const tokenResponse = await fetch("https://oauth.onshape.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: identity.refreshToken || "",
        client_id: env.ONSHAPE_CLIENT_ID,
        client_secret: env.ONSHAPE_CLIENT_SECRET,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to refresh OnShape token");
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const newExpiresAt = now + tokenData.expires_in;

    await db
      .update(coreUserIdentities)
      .set({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt: newExpiresAt,
      })
      .where(eq(coreUserIdentities.id, identity.id))
      .run();

    return tokenData.access_token;
  }

  return identity.accessToken || "";
}

export async function onshapeRequest(
  userId: string,
  path: string,
  env: AppEnv["Bindings"],
  options?: {
    method?: string;
    body?: unknown;
  },
) {
  const token = await getValidOnshapeToken(userId, env);

  const fetchOptions: RequestInit = {
    method: options?.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(`https://cad.onshape.com/api${path}`, fetchOptions);

  if (!response.ok) {
    throw new Error(`OnShape API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
