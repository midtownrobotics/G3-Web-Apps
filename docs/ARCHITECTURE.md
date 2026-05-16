# Architecture

## Overview

One monorepo, pnpm workspaces, no build orchestrator. Each app and Worker is independently deployable.

```
apps/
  web/       → Cloudflare Pages (public site)
  admin/     → Cloudflare Pages + Access (internal dashboard)
  scouting/  → Cloudflare Pages (offline-first PWA)
workers/
  api/       → Cloudflare Worker, Hono (single Worker, module-mounted)
packages/
  db/        → Drizzle schema + D1 client factory
  ui/        → shared React components
  auth/      → Cloudflare Access JWT helpers
```

## Frontend: plugin pattern

Every app uses the same plugin pattern. A plugin is a folder:

```
plugins/{name}/
  index.tsx      ← exports Plugin { name, routes, navItems }
  README.md
  ...page components
```

`plugins.config.ts` holds the ordered list of registered plugins.
`app.tsx` flatMaps `routes` and `navItems` from all plugins — it never changes for feature work.

Adding a feature: create a folder, add one line to `plugins.config.ts`.

## Backend: module pattern

`workers/api` is a single Hono Worker. Features are modules:

```
modules/{name}/
  index.ts       ← exports ApiModule { name, basePath, router }
  service.ts
  schema/        ← append-only SQL migrations
  README.md
```

`modules.config.ts` holds the ordered list. `index.ts` mounts them via `app.route()`.

Modules do not import from each other.

## Data layer

- **D1** — single relational database, table-prefix namespaced per module
- **R2** — media, CAD exports, large binaries
- **KV** — sessions, TBA cache, feature flags

## Auth

Cloudflare Access guards `admin.*` and private API routes. The scouting submission flow is anonymous by design (arena WiFi is unreliable).

## Cloudflare resource naming

```
Workers:  1648-{purpose}-{env}     e.g. 1648-api-prod
Pages:    1648-{app}               e.g. 1648-web
D1:       1648-team-{env}
R2:       1648-{purpose}-{env}
KV:       1648-{purpose}-{env}
```
