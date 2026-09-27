import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { devServer, teamHtml } from "../../packages/config/src/vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), teamHtml()],
  server: devServer("scouting", "scouting"),
});
