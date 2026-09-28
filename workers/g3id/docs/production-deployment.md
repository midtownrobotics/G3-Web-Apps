# Production Deployment

The worker (`workers/g3id`) and the frontend app (`apps/g3id`) are deployed separately. Hostnames come from
`packages/config/team.json` (`rootDomain`, `apps.g3id.host`, `workers.g3id.host`):

```
https://g3id.<rootDomain>          → Cloudflare Pages (frontend)
https://api.g3id.<rootDomain>      → Cloudflare Worker (g3id-production)
```

The frontend calls the worker directly at the `api.` subdomain. In dev, the Vite dev server proxies `/api/*` to the
worker instead.

---

## Worker

Configured by `workers/g3id/cloudflare.config.ts`, which reads names, resource IDs, the custom domain, and OAuth
client IDs from `team.json`. Requires Node 22.18+ (`nvm use` picks the repo's `.nvmrc`).

### 1. Deploy

```
cd workers/g3id
pnpm exec cf auth login     # once, or set CLOUDFLARE_API_TOKEN
pnpm exec cf deploy --dry-run   # builds and prints bindings, uploads nothing
pnpm deploy                 # cf deploy (production mode)
```

`cf deploy` also attaches the custom domain `api.g3id.<rootDomain>` (declared as `domains` in the config).

### 2. Set production secrets

Secrets are never committed. `cf` can't set a single secret yet, so use Wrangler with the worker name:

```
npx wrangler secret put GOOGLE_CLIENT_SECRET --name g3id-production
npx wrangler secret put GITHUB_CLIENT_SECRET --name g3id-production
npx wrangler secret put SLACK_BOT_TOKEN --name g3id-production
npx wrangler secret put SLACK_SIGNING_SECRET --name g3id-production
npx wrangler secret put STEAM_API_KEY --name g3id-production
npx wrangler secret put ONSHAPE_CLIENT_SECRET --name g3id-production
```

Or upload them with a deploy: `pnpm exec cf deploy --secrets-file <file>` (JSON or `.env` format).
Locally, secrets come from `workers/g3id/.dev.vars` (see `.dev.vars.example`).

### 3. Register the production redirect URIs

Client IDs live in `team.json` under `integrations`. Each OAuth app must allowlist its production callback:

| Provider | Redirect URI                                          |
| -------- | ----------------------------------------------------- |
| Google   | `https://api.g3id.<rootDomain>/auth/google/callback`  |
| GitHub   | `https://api.g3id.<rootDomain>/auth/github/callback`  |
| Steam    | `https://api.g3id.<rootDomain>/auth/steam/callback`   |
| OnShape  | `https://api.g3id.<rootDomain>/auth/onshape/callback` |

In dev, callbacks go through the app proxy: `http://localhost:5173/api/auth/<provider>/callback`.

### 4. Database migrations

The production database (name + ID) is `workers.g3id.d1` in `team.json`:

```
cd workers/g3id
pnpm db:migrate:remote   # cf d1 migrations apply <id from team.json>
pnpm db:migrate:local    # same, against local dev data in .cloudflare/state
```

---

## Frontend

Create a Cloudflare Pages project for this repo:

- **Build command:** `pnpm --filter @g3/g3id build`
- **Build output directory:** `apps/g3id/dist`
- **Root directory:** `/` (repo root)

No environment variables are needed; API URLs are derived from `team.json` at build time. Attach the custom domain
`g3id.<rootDomain>` under **Custom Domains**.
