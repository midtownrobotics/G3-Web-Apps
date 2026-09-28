import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { devServer, teamBranding } from "../../packages/config/src/vite";

export default defineConfig({
  plugins: [teamBranding(), react(), tailwindcss()],
  server: devServer("web"),
});
