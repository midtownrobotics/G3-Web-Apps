import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { devServer, teamBranding } from "../../packages/config/src/vite";

export default defineConfig({
  plugins: [teamBranding(), react()],
  server: devServer("attendance", "attendance", { changeOrigin: true }),
});
