import { type AppName, type Mode, type WorkerName, apiUrl, appUrl } from "./index";

// Only import this from Vite-built apps: it relies on import.meta.env.
const env = (import.meta as unknown as { env: Record<string, string | boolean | undefined> }).env;

const mode: Mode = env.DEV ? "development" : "production";

/** URL of another app. `VITE_G3ID_URL` overrides the G3ID URL (e.g. for a dev tunnel). */
export function linkTo(app: AppName): string {
  if (app === "g3id" && typeof env.VITE_G3ID_URL === "string") return env.VITE_G3ID_URL;
  return appUrl(app, mode);
}

/** Base URL for an app's own worker: the Vite `/api` proxy in dev, the API domain in prod. */
export function apiBase(worker: WorkerName): string {
  if (typeof env.VITE_API_BASE_URL === "string") return env.VITE_API_BASE_URL;
  return mode === "development" ? "/api" : apiUrl(worker, "production");
}

/** Direct URL of any worker (no proxy), for cross-worker calls from the browser. */
export function workerUrl(worker: WorkerName): string {
  return apiUrl(worker, mode);
}

export function loginUrl(returnTo: string = window.location.href): string {
  return `${linkTo("g3id")}/login?redirect=${encodeURIComponent(returnTo)}`;
}
