import {
  accountId,
  apiUrl,
  appUrl,
  d1,
  integrations,
  kv,
  modeOf,
  workerBase,
} from "@g3/config/cloudflare";
import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig(({ mode: rawMode }) => {
  const mode = modeOf(rawMode);
  // OAuth callbacks go straight to the API in production, and through the g3id app's /api proxy in dev.
  const callback = (provider: string) =>
    mode === "production"
      ? `${apiUrl("g3id")}/auth/${provider}/callback`
      : `${appUrl("g3id", "development")}/api/auth/${provider}/callback`;

  return {
    accountId,
    worker: {
      ...workerBase("g3id", mode),
      entrypoint,
      observability: {
        enabled: false,
        headSamplingRate: 1,
        logs: { enabled: true, headSamplingRate: 1, persist: true, invocationLogs: true },
        traces: { enabled: false, persist: true, headSamplingRate: 1 },
      },
      env: {
        DB: bindings.d1(d1("g3id", mode)),
        SESSIONS: bindings.kv(kv("sessions", mode)),
        RATE_LIMIT: bindings.kv(kv("rateLimit", mode)),
        ENVIRONMENT: bindings.text(mode),
        FRONTEND_URL: bindings.text(appUrl("g3id", mode)),
        GOOGLE_CLIENT_ID: bindings.text(integrations.googleClientId),
        GOOGLE_REDIRECT_URI: bindings.text(callback("google")),
        GITHUB_CLIENT_ID: bindings.text(integrations.githubClientId),
        GITHUB_REDIRECT_URI: bindings.text(callback("github")),
        SLACK_TEAM_ID: bindings.text(integrations.slackTeamId),
        SLACK_APP_ID: bindings.text(integrations.slackAppId),
        STEAM_REDIRECT_URI: bindings.text(callback("steam")),
        ONSHAPE_CLIENT_ID: bindings.text(integrations.onshapeClientId),
        ONSHAPE_REDIRECT_URI: bindings.text(callback("onshape")),
        GOOGLE_CLIENT_SECRET: bindings.secret(),
        GITHUB_CLIENT_SECRET: bindings.secret(),
        SLACK_BOT_TOKEN: bindings.secret(),
        SLACK_SIGNING_SECRET: bindings.secret(),
        STEAM_API_KEY: bindings.secret(),
        ONSHAPE_CLIENT_SECRET: bindings.secret(),
      },
    },
  };
});
