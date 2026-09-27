import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { devServer } from "../../packages/config/src/vite";

export default defineConfig({
  plugins: [react()],
  server: devServer("attendance", "attendance", { changeOrigin: true }),
});
