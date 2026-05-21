# Production Deployment

The worker (`workers/g3id`) and the frontend app (`apps/g3id`) are deployed separately. The worker runs on a dedicated subdomain; the frontend is hosted on Cloudflare Pages.

---

## Architecture

```
https://g3id.g3robotics.com          → Cloudflare Pages (frontend)
https://api.g3id.g3robotics.com      → Cloudflare Worker (g3id)
```

The frontend calls the worker directly at the `api.` subdomain. There is no proxy — unlike dev, where the Vite dev server proxies `/api/*` to `localhost:8787`.

---

## Worker Deployment

### 1. Deploy the worker

```
cd workers/g3id
wrangler deploy --env production
```

### 2. Attach a custom domain

In the Cloudflare dashboard, go to **Workers & Pages → g3id-production → Settings → Domains & Routes** and add `api.g3id.g3robotics.com` as a custom domain. Cloudflare will provision the DNS record and TLS certificate automatically.

### 3. Set production secrets

Secrets are set per-environment and are never committed to the repo. Run each command and paste the value when prompted:

```
wrangler secret put GOOGLE_CLIENT_ID      --env production
wrangler secret put GOOGLE_CLIENT_SECRET  --env production
wrangler secret put GOOGLE_REDIRECT_URI   --env production
# value: https://api.g3id.g3robotics.com/auth/google/callback
```

Repeat for any other OAuth providers as they are added.

### 4. Register the production redirect URI with each OAuth provider

Every OAuth app (Google, GitHub, etc.) must have the production callback URL explicitly allowlisted:

| Provider | Redirect URI to register |
|----------|--------------------------|
| Google   | `https://api.g3id.g3robotics.com/auth/google/callback` |
| GitHub   | `https://api.g3id.g3robotics.com/auth/github/callback` |

Add new rows here as providers are added.

---

## Frontend Deployment

### 1. Connect the repo to Cloudflare Pages

In the Cloudflare dashboard, create a new Pages project pointing at this repo. Set the following build configuration:

- **Build command:** `pnpm --filter @g3/g3id build`
- **Build output directory:** `apps/g3id/dist`
- **Root directory:** `/` (repo root)

### 2. Set the API base URL environment variable

In the Pages project settings under **Environment Variables**, add:

| Variable | Value |
|----------|-------|
| `VITE_API_BASE_URL` | `https://api.g3id.g3robotics.com` |

This is read at build time by Vite and baked into the frontend bundle. Without it the frontend falls back to an empty string and all API calls break in production.

### 3. Attach the custom domain

In the Pages project under **Custom Domains**, add `g3id.g3robotics.com`.

---

## Environment Variable Reference

| Variable | Where set | Dev value | Production value |
|----------|-----------|-----------|-----------------|
| `VITE_API_BASE_URL` | Pages env vars (build-time) | `/api` (via `.env`) | `https://api.g3id.g3robotics.com` |
| `GOOGLE_CLIENT_ID` | Wrangler secret | `.dev.vars` | wrangler secret |
| `GOOGLE_CLIENT_SECRET` | Wrangler secret | `.dev.vars` | wrangler secret |
| `GOOGLE_REDIRECT_URI` | Wrangler secret | `http://localhost:5173/api/auth/google/callback` | `https://api.g3id.g3robotics.com/auth/google/callback` |

---

## Database

The D1 databases and KV namespaces for production are already declared in `wrangler.toml` under `[env.production]`. Run migrations against the production database with:

```
wrangler d1 migrations apply g3-auth-prod --env production --remote
```
