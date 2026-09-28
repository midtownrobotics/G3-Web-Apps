import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const teamConfig = JSON.parse(
  fs.readFileSync(path.join(root, "packages", "config", "team.json"), "utf8"),
);

// Same rule as isEnabled() in packages/config/src/index.ts.
const isEnabled = (entry) => !!entry && entry.enabled !== false;
const dirName = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export const enabledApps = Object.keys(teamConfig.apps).filter((key) =>
  isEnabled(teamConfig.apps[key]),
);

/** apps/<app> and workers/<app> folders of every enabled app. */
export const enabledPackageDirs = enabledApps
  .flatMap((key) => [`apps/${dirName(key)}`, `workers/${dirName(key)}`])
  .filter((dir) => fs.existsSync(path.join(root, dir, "package.json")));

export const pnpmFilters = enabledPackageDirs.flatMap((dir) => ["--filter", `./${dir}`]);
