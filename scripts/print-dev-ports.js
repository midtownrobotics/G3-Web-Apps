#!/usr/bin/env node

import { spawn } from "node:child_process";
import { enabledApps, pnpmFilters, root, teamConfig } from "./enabled-apps.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServers(config, timeout = 60000) {
  const startTime = Date.now();
  const allServers = [...Object.values(config.apps), ...Object.values(config.workers)];

  console.log("⏳ Waiting for servers to be ready...");

  while (Date.now() - startTime < timeout) {
    let readyCount = 0;

    for (const server of allServers) {
      try {
        await fetch(server.url, {
          method: "HEAD",
          timeout: 1000,
        });
        server.ready = true;
        readyCount++;
      } catch {
        server.ready = false;
      }
    }

    if (readyCount === allServers.length) {
      return true;
    }

    process.stdout.write(`\r✓ ${readyCount}/${allServers.length} servers ready`);
    await sleep(1000);
  }

  process.stdout.write("\n");
  return false;
}

function printServerInfo(config) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${teamConfig.team.name} Development Servers`);
  console.log(`${"=".repeat(60)}\n`);

  console.log("📱 Apps:");
  for (const [, server] of Object.entries(config.apps)) {
    console.log(`  • ${server.name.padEnd(30)} ${server.url}`);
  }

  console.log("\n⚙️  Workers:");
  for (const [, server] of Object.entries(config.workers)) {
    console.log(`  • ${server.name.padEnd(30)} ${server.url}`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("  ✅ All servers are ready!");
  console.log(`${"=".repeat(60)}\n`);
}

async function main() {
  try {
    const withUrl = (servers) =>
      Object.fromEntries(
        enabledApps
          .filter((key) => servers[key])
          .map((key) => [
            key,
            { ...servers[key], url: `http://localhost:${servers[key].devPort}` },
          ]),
      );
    const config = { apps: withUrl(teamConfig.apps), workers: withUrl(teamConfig.workers) };

    console.log(`🚀 Starting ${teamConfig.team.name} development servers...\n`);

    // Start the dev servers in background
    const devProcess = spawn("pnpm", [...pnpmFilters, "--parallel", "--if-present", "dev"], {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });

    // Wait for servers to be ready
    const allReady = await waitForServers(config);

    // Clear the loading line
    console.log("\n");

    // Print server info
    printServerInfo(config);

    if (!allReady) {
      console.log("⚠️  Timeout waiting for servers, but they may still be starting...\n");
    }

    // Keep the process alive
    devProcess.on("exit", (code) => {
      process.exit(code || 0);
    });
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
