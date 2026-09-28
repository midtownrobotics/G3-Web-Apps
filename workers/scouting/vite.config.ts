import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { workers } from "../../packages/config/src/index";
import { workerVite } from "../../packages/config/src/vite";

export default defineConfig({
  plugins: [cloudflare({ inspectorPort: workers.scouting.inspectorPort })],
  ...workerVite("scouting"),
});
