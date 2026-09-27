import { type AppName, type WorkerName, apiUrl, appUrl, apps, dev, workers } from "./index";

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

/**
 * Workbox matcher for a worker's API: the `/api` proxy in dev, its API host in prod.
 * A RegExp, not a function: Workbox serializes it into sw.js, where closures don't survive.
 */
export function apiRequestMatcher(worker: WorkerName): RegExp {
  const prodOrigin = apiUrl(worker).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(${prodOrigin}/|https?://[^/]+/api/)`);
}

/** Replaces `%APP_URL:<app>%` tokens in index.html with that app's production URL. */
export function teamHtml() {
  return {
    name: "g3-team-html",
    transformIndexHtml: (html: string) =>
      html.replace(/%APP_URL:(\w+)%/g, (_, app: string) => appUrl(app as AppName)),
  };
}
