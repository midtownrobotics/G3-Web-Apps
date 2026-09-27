import { devServer, teamHtml } from "../../packages/config/src/vite";
import { defineConfig } from "vite";

// The skill-tree app is intentionally buildless vanilla JS (no framework, no
// TypeScript). Vite just serves the ES modules in dev and bundles them for prod.
export default defineConfig({
  plugins: [teamHtml()],
  server: devServer("skillTree"),
});
