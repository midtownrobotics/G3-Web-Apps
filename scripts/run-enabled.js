#!/usr/bin/env node
// Runs a package script in every enabled app and worker, e.g. `node scripts/run-enabled.js build`.

import { spawn } from "node:child_process";
import { pnpmFilters, root } from "./enabled-apps.js";

const child = spawn("pnpm", [...pnpmFilters, "--if-present", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 1));
