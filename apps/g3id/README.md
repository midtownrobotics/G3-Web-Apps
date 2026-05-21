# @g3/g3id

Identity and access app — Vite + React + React Router + Tailwind.

## Dev

```bash
pnpm --filter @g3/g3id dev
```

## Cloudflare Pages

| Field | Value |
|---|---|
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @g3/g3id build` |
| Build output directory | `apps/g3id/dist` |
| Root directory | *(empty)* |

## Adding a plugin

1. Create `src/plugins/{name}/` with `index.tsx` and your page components.
2. Export a `Plugin` object from `index.tsx`.
3. Add one import + one entry to `src/plugins.config.ts`.
