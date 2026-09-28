# Architecture

## Overview

One monorepo, pnpm workspaces, no build orchestrator. Each app and Worker is independently deployable.

```
apps/          → Cloudflare Pages (Vite + React, except skill-tree which is vanilla JS)
  g3id/          login, account, admin, kiosk
  shop/          Shop SW — parts, processes, kiosk (PWA)
  pit/           pit checklists + monitor (PWA)
  web/           members portal / app launcher
  skill-tree/    skill trees
  attendance/    attendance sign-in
  scouting/      strategy + scouting
workers/       → Cloudflare Workers (Hono), one per app
  g3id/          auth + sessions; every other worker validates sessions through it
  shop/ pit/ skill-tree/ attendance/ scouting/
packages/
  config/        team config (domain, hosts, ports, links) + URL/CORS/cookie helpers
  auth/          session-cookie → user id lookup (KV)
  slack/         Slack API + signature verification
  ui/            shared React components + Tailwind theme
```

## Team configuration

Everything team- or domain-specific lives in `packages/config/team.json`: team number/name/links, root
domain, each app's and worker's subdomain and dev port, and external URLs. Code never hardcodes these;
it uses the helpers in `@g3/config`:

- Workers: `allowedOrigin()` (CORS), `cookieDomain()`, `isTeamHostname()`, `appUrl()` / `apiUrl()`
- Apps: `@g3/config/client` → `apiBase()`, `linkTo()`, `workerUrl()`, `loginUrl()`
- Vite configs: `packages/config/src/vite` → `devServer()`, `apiRequestMatcher()`, `teamBranding()`, `workerVite()`
  (imported by relative path because Vite loads its config with plain Node, which can't import `.ts` from a package)
- Worker configs (`workers/*/cloudflare.config.ts`): `@g3/config/cloudflare` → worker names, custom domains,
  D1/KV bindings, and integration values from `team.json`

## Workers: cf

Workers are built, run and deployed with the Cloudflare CLI `cf` (beta) using the Vite bundler
(`@cloudflare/vite-plugin` 2.0 beta). Each worker has a `cloudflare.config.ts` (a function of the mode: `cf dev` →
development, `cf build`/`cf deploy` → production) and a `vite.config.ts`. Production resource IDs live in
`team.json`; local dev uses placeholder IDs and keeps data in each worker's `.cloudflare/state/`.

## Frontend: plugin pattern

The React apps use a plugin pattern. A plugin is a folder:

```
plugins/{name}/
  index.tsx      ← exports Plugin { name, routes, navItems }
  ...page components
```

`plugins.config.ts` holds the ordered list of registered plugins; `app.tsx` flatMaps their `routes` and
`navItems`. Adding a feature: create a folder, add one line to `plugins.config.ts`.

## Auth

G3ID owns users and sessions. The session cookie (`g3_session`) is set on the root domain so every
subdomain sends it. Other workers validate it through a service binding to the g3id worker
(`c.env.G3ID.fetch("http://g3id/auth/me")` — the hostname is ignored; the binding routes by worker name).
Shop kiosks use PIN sessions, which are blocked from admin routes.

## Data layer

- **D1** — one database per worker (auth, shop, pit, skill-tree, scouting)
- **KV** — `SESSIONS` (shared by g3id, shop, pit, skill-tree), `RATE_LIMIT`
- **R2** — shop drawings, scouting field maps
- **Queues** — shop BOM fetch jobs
