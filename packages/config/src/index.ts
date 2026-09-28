import config from "../team.json" with { type: "json" };

export type Mode = "production" | "development";

/** Every app in the repo. team.json decides which are enabled. */
export const appNames = [
  "g3id",
  "shop",
  "pit",
  "web",
  "skillTree",
  "attendance",
  "scouting",
] as const;
export type AppName = (typeof appNames)[number];

/** Apps with a worker (same key); a worker is enabled exactly when its app is. */
const workerNames = ["g3id", "shop", "pit", "skillTree", "attendance", "scouting"] as const;
export type WorkerName = (typeof workerNames)[number];

type AppConfig = {
  name: string;
  host: string;
  devPort: number;
  extraHosts?: string[];
  enabled?: boolean;
};
type WorkerConfig = {
  name: string;
  host: string;
  devPort: number;
  inspectorPort: number;
  /** Production D1 database, for workers that have one. */
  d1?: { name: string; id: string };
};

const rawApps = config.apps as Partial<Record<string, AppConfig | false>>;
const rawWorkers = config.workers as Partial<Record<string, WorkerConfig>>;

/** An app is enabled when its team.json entry exists, isn't `false`, and doesn't set `"enabled": false`. */
export function isEnabled(app: AppName): boolean {
  const entry = rawApps[app];
  return !!entry && entry.enabled !== false;
}

export const enabledApps: AppName[] = appNames.filter(isEnabled);

for (const key of Object.keys(rawApps)) {
  if (!(appNames as readonly string[]).includes(key)) {
    throw new Error(`team.json: unknown app "${key}" (known apps: ${appNames.join(", ")})`);
  }
}
if (!isEnabled("g3id"))
  throw new Error("team.json: the g3id app is required and can't be disabled");
for (const name of workerNames) {
  if (isEnabled(name) && !rawWorkers[name]) {
    throw new Error(`team.json: app "${name}" is enabled but has no "workers.${name}" entry`);
  }
}

function disabledError(app: string): Error {
  return new Error(
    `App "${app}" is disabled in packages/config/team.json; check isEnabled() first`,
  );
}

/** Config for each app. Reading a disabled app throws, so a missed link fails loudly instead of rendering a broken URL. */
export const apps = Object.defineProperties(
  {} as Record<AppName, AppConfig>,
  Object.fromEntries(
    appNames.map((name) => [
      name,
      {
        enumerable: true,
        get: () => {
          if (!isEnabled(name)) throw disabledError(name);
          return rawApps[name] as AppConfig;
        },
      },
    ]),
  ),
);

/** Config for each worker. Reading the worker of a disabled app throws. */
export const workers = Object.defineProperties(
  {} as Record<WorkerName, WorkerConfig>,
  Object.fromEntries(
    workerNames.map((name) => [
      name,
      {
        enumerable: true,
        get: () => {
          if (!isEnabled(name)) throw disabledError(name);
          return rawWorkers[name] as WorkerConfig;
        },
      },
    ]),
  ),
);

export const team = config.team;
export const cloudflare = config.cloudflare;
export const integrations = config.integrations;
export const rootDomain = config.rootDomain;
export const external = config.external;
export const dev = config.dev;

export const rootUrl = `https://${rootDomain}`;
export const tbaTeamUrl = `https://www.thebluealliance.com/team/${team.number}`;
export const statboticsTeamUrl = `https://www.statbotics.io/team/${team.number}`;

export function appUrl(app: AppName, mode: Mode = "production"): string {
  const { host, devPort } = apps[app];
  return mode === "development" ? `http://localhost:${devPort}` : `https://${host}.${rootDomain}`;
}

export function apiUrl(worker: WorkerName, mode: Mode = "production"): string {
  const { host, devPort } = workers[worker];
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
