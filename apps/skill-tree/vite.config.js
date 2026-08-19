import { defineConfig } from "vite";

// The skill-tree app is intentionally buildless vanilla JS (no framework, no
// TypeScript). Vite just serves the ES modules in dev and bundles them for prod.
// Backend URLs are resolved at runtime in firebase.js based on the hostname.
export default defineConfig({
  server: {
    port: 5180,
    allowedHosts: [".grayjn.com"],
  },
});
