import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "G3 Shop",
        short_name: "G3 Shop",
        description: "G3 Robotics parts management and shop operations",
        theme_color: "#111827",
        background_color: "#030712",
        display: "standalone",
        scope: "/",
        start_url: "/",
        lang: "en",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            // Dev: same-origin /api/* via Vite proxy
            // Prod: https://api.shop.g3robotics.com/*
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/") || url.hostname === "api.shop.g3robotics.com",
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5174,
    strictPort: true,
    allowedHosts: [".grayjn.com"],
    proxy: {
      "/api": {
        target: "http://localhost:8788",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
