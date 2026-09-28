import { createReadStream, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type AppName, type WorkerName, apiUrl, appUrl, apps, dev, team, workers } from "./index";

/** Dev server for an app: its port, tunnel hosts, and an `/api` proxy to its worker. */
export function devServer(
  app: AppName,
  proxyTo?: WorkerName,
  options: { changeOrigin?: boolean } = {},
) {
  return {
    port: apps[app].devPort,
    strictPort: true,
    allowedHosts: dev.allowedHosts,
    ...(proxyTo && {
      proxy: {
        "/api": {
          target: `http://localhost:${workers[proxyTo].devPort}`,
          changeOrigin: options.changeOrigin ?? false,
          rewrite: (path: string) => path.replace(/^\/api/, ""),
        },
      },
    }),
  };
}

/** Vite settings for a worker run by `cf dev`. */
export function workerVite(worker: WorkerName) {
  return { server: { port: workers[worker].devPort, strictPort: true } };
}

/**
 * Workbox matcher for a worker's API: the `/api` proxy in dev, its API host in prod.
 * A RegExp, not a function: Workbox serializes it into sw.js, where closures don't survive.
 */
export function apiRequestMatcher(worker: WorkerName): RegExp {
  const prodOrigin = apiUrl(worker).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(${prodOrigin}/|https?://[^/]+/api/)`);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const htmlTokens: Record<string, string> = {
  TEAM_NAME: team.name,
  TEAM_NUMBER: String(team.number),
  SITE_DESCRIPTION: team.siteDescription,
};

const assetsDir = fileURLToPath(new URL("../assets/", import.meta.url));
const assetTypes: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const iconLink = (attrs: Record<string, string>) => ({
  tag: "link",
  attrs,
  injectTo: "head" as const,
});

const faviconTags = [
  iconLink({ rel: "icon", type: "image/png", sizes: "512x512", href: "/logo.png" }),
  iconLink({ rel: "icon", type: "image/png", sizes: "192x192", href: "/pwa-192x192.png" }),
  iconLink({ rel: "apple-touch-icon", href: "/apple-touch-icon.png" }),
];

type DevServer = {
  middlewares: {
    use: (
      fn: (
        req: { url?: string },
        res: { setHeader: (k: string, v: string) => void } & NodeJS.WritableStream,
        next: () => void,
      ) => void,
    ) => void;
  };
};

/**
 * Team branding for an app:
 * - serves/emits every file in `packages/config/assets/` (logo, favicon, PWA icons) at the site root
 * - adds the same favicon/touch-icon links to every app's index.html
 * - fills index.html tokens: `%TEAM_NAME%`, `%TEAM_NUMBER%`, `%SITE_DESCRIPTION%`,
 *   `%APP_NAME:<app>%` (that app's display name) and `%APP_URL:<app>%` (its production URL)
 */
export function teamBranding() {
  const assets = readdirSync(assetsDir).filter((f) => extname(f) in assetTypes);
  return {
    name: "g3-team-branding",
    configureServer(server: DevServer) {
      server.middlewares.use((req, res, next) => {
        const file = req.url?.split("?")[0].slice(1) ?? "";
        if (!assets.includes(file)) return next();
        res.setHeader("Content-Type", assetTypes[extname(file)]);
        createReadStream(join(assetsDir, file)).pipe(res);
      });
    },
    generateBundle(this: {
      emitFile: (f: { type: "asset"; fileName: string; source: Uint8Array }) => void;
    }) {
      for (const file of assets) {
        this.emitFile({
          type: "asset",
          fileName: file,
          source: readFileSync(join(assetsDir, file)),
        });
      }
    },
    transformIndexHtml: (html: string) => ({
      html: html
        .replace(/%APP_URL:(\w+)%/g, (_, app: string) => appUrl(app as AppName))
        .replace(/%APP_NAME:(\w+)%/g, (_, app: string) => escapeHtml(apps[app as AppName].name))
        .replace(/%([A-Z_]+)%/g, (token, key: string) =>
          key in htmlTokens ? escapeHtml(htmlTokens[key]) : token,
        ),
      tags: faviconTags,
    }),
  };
}
