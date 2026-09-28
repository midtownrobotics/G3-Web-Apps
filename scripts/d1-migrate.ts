#!/usr/bin/env node
// Applies a worker's D1 migrations with cf, using the database ID from team.json (production)
// or the local placeholder (dev). Run from the worker folder: `node ../../scripts/d1-migrate.ts <worker> [--remote]`.

import { spawnSync } from "node:child_process";
import { d1 } from "../packages/config/src/cloudflare.ts";
import type { WorkerName } from "../packages/config/src/index.ts";

const [worker, flag] = process.argv.slice(2);
const remote = flag === "--remote";
const { id } = d1(worker as WorkerName, remote ? "production" : "development");

const args = ["d1", "migrations", "apply", id, "--dir", "src/db/migrations"];
if (!remote) args.push("--local", "--persist-to", ".cloudflare/state");

const result = spawnSync("cf", args, { stdio: "inherit" });
process.exit(result.status ?? 1);
