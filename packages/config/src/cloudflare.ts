// Worker settings for cloudflare.config.ts files.
//
// This module reads team.json from disk instead of importing it (or ./index.ts): the Cloudflare
// Vite plugin blocks the dev server from serving every module a cloudflare.config.ts imports,
// and worker code imports @g3/config at runtime. cf also loads these configs with plain Node,
// so keep to erasable TypeScript syntax and explicit `.ts` import paths.
import { readFileSync } from "node:fs";
import type { AppName, Mode, WorkerName } from "./index.ts";

type TeamJson = typeof import("../team.json");
type AppEntry = { host: string; devPort: number; enabled?: boolean } | false | undefined;
type WorkerEntry = { host: string; d1?: { name: string; id: string } };

const config: TeamJson = JSON.parse(readFileSync(new URL("../team.json", import.meta.url), "utf8"));
const appEntries = config.apps as Partial<Record<AppName, AppEntry>>;
const workerEntries = config.workers as Partial<Record<WorkerName, WorkerEntry>>;

export type { Mode };
export const accountId = config.cloudflare.accountId;
export const integrations = config.integrations;
export const r2Buckets = config.cloudflare.r2;
export const queues = config.cloudflare.queues;

/** Workers runtime compatibility date shared by every worker. */
export const compatibilityDate = "2026-05-17";

/** `cf dev` evaluates configs in "development" mode; `cf build`/`cf deploy` in "production". */
export function modeOf(rawMode: string | undefined): Mode {
  return rawMode === "production" ? "production" : "development";
}

function appEntry(app: AppName) {
  const entry = appEntries[app];
  if (!entry || entry.enabled === false) throw new Error(`App "${app}" is disabled in team.json`);
  return entry;
}

function workerEntry(worker: WorkerName) {
  appEntry(worker);
  const entry = workerEntries[worker];
  if (!entry) throw new Error(`team.json: no "workers.${worker}" entry`);
  return entry;
}

/** Same as appUrl() in ./index.ts. */
export function appUrl(app: AppName, mode: Mode): string {
  const { host, devPort } = appEntry(app);
  return mode === "production"
    ? `https://${host}.${config.rootDomain}`
    : `http://localhost:${devPort}`;
}

/** Production API URL of a worker, e.g. https://api.g3id.g3robotics.com. */
export function apiUrl(worker: WorkerName): string {
  return `https://${workerEntry(worker).host}.${config.rootDomain}`;
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Deployed Worker name: "<worker>-production" in production, "<worker>" in local dev. */
export function workerScriptName(worker: WorkerName, mode: Mode): string {
  return mode === "production" ? `${kebab(worker)}-production` : kebab(worker);
}

/** Name, compatibility date and (in production) custom domain for a worker. */
export function workerBase(worker: WorkerName, mode: Mode) {
  const { host } = workerEntry(worker);
  return {
    name: workerScriptName(worker, mode),
    compatibilityDate,
    ...(mode === "production" && { domains: [`${host}.${config.rootDomain}`] }),
  };
}

// Local-only resource IDs. D1 IDs must look like UUID v4s for `cf d1 migrations`.
const localD1Ids: Partial<Record<WorkerName, string>> = {
  g3id: "00000000-0000-4000-8000-000000000001",
  shop: "00000000-0000-4000-8000-000000000002",
  pit: "00000000-0000-4000-8000-000000000003",
  skillTree: "00000000-0000-4000-8000-000000000004",
  scouting: "00000000-0000-4000-8000-000000000005",
};

/** D1 binding options: the team.json database in production, a local placeholder in dev. */
export function d1(worker: WorkerName, mode: Mode): { name: string; id: string } {
  const prod = workerEntry(worker).d1;
  const localId = localD1Ids[worker];
  if (!prod || !localId) throw new Error(`team.json: workers.${worker} has no "d1" database`);
  return mode === "production" ? prod : { name: `${kebab(worker)}-local`, id: localId };
}

/** KV binding options from team.json `cloudflare.kv`; local dev gets a named local namespace. */
export function kv(namespace: keyof TeamJson["cloudflare"]["kv"], mode: Mode): { id: string } {
  return { id: mode === "production" ? config.cloudflare.kv[namespace] : `local-${namespace}` };
}
