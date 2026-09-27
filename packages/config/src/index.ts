import config from "../team.json";

export type Mode = "production" | "development";
export type AppName = keyof typeof config.apps;
export type WorkerName = keyof typeof config.workers;

export const team = config.team;
export const rootDomain = config.rootDomain;
export const apps = config.apps;
export const workers = config.workers;
export const external = config.external;
export const dev = config.dev;

export const rootUrl = `https://${rootDomain}`;
export const tbaTeamUrl = `https://www.thebluealliance.com/team/${team.number}`;
export const statboticsTeamUrl = `https://www.statbotics.io/team/${team.number}`;

export function appUrl(app: AppName, mode: Mode = "production"): string {
  const { host, devPort } = config.apps[app];
  return mode === "development" ? `http://localhost:${devPort}` : `https://${host}.${rootDomain}`;
}

export function apiUrl(worker: WorkerName, mode: Mode = "production"): string {
  const { host, devPort } = config.workers[worker];
  return mode === "development" ? `http://localhost:${devPort}` : `https://${host}.${rootDomain}`;
}

/** Infers the mode from a worker's FRONTEND_URL var. */
export function modeFromUrl(url: string): Mode {
  try {
    const { hostname } = new URL(url);
    return isLocalHostname(hostname) ? "development" : "production";
  } catch {
    return "production";
  }
}

export function isTeamHostname(hostname: string): boolean {
  return hostname === rootDomain || hostname.endsWith(`.${rootDomain}`);
}

export function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** CORS origin check shared by every worker. Returns the origin when allowed, else null. */
export function allowedOrigin(
  origin: string | undefined,
  options: { allowPagesDev?: boolean } = {},
): string | null {
  if (!origin) return null;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (isTeamHostname(url.hostname)) return origin;
  if (url.protocol === "http:" && isLocalHostname(url.hostname)) return origin;
  if (options.allowPagesDev && url.hostname.endsWith(".pages.dev")) return origin;
  return null;
}

/** Domain for the shared session cookie, so every team subdomain sees it. */
export function cookieDomain(frontendUrl: string): string | undefined {
  try {
    const { hostname } = new URL(frontendUrl);
    if (hostname === "localhost") return "localhost";
    if (isTeamHostname(hostname)) return rootDomain;
  } catch {}
  return undefined;
}
