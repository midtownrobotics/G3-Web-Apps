# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

**Install & Develop:**
```bash
pnpm install
pnpm dev              # Start all apps and workers in parallel
pnpm typecheck        # Type check all packages
pnpm lint            # Run Biome linting and formatting
```

**Commit Quality:**
```bash
pnpm biome check --write   # Fix formatting/linting before commit
pnpm -r --if-present typecheck  # Ensure no type errors
```

## Repository Structure

**Monorepo using pnpm workspaces with three categories:**

- `apps/` — React frontends (g3id, web, shop, pit, attendance)
- `workers/` — Cloudflare Workers backends (g3id, shop, pit, skill-tree, attendance)
- `packages/` — Shared libraries (auth, ui)

## Architecture Overview

### Core Stack
- **Backend**: Hono (routing), Drizzle ORM (database), Cloudflare Workers (serverless)
- **Frontend**: React, React Router, Tailwind CSS v4
- **Database**: Cloudflare D1 (SQLite-compatible)
- **Storage**: Cloudflare KV (sessions, rate limiting)
- **Auth**: Slack (primary), Google, GitHub, Steam, Email (local), PIN (kiosk)

### Key Systems

**G3ID Authentication Worker** (`workers/g3id/`)
- RESTful routes at `/auth/*` for login flows
- Slack integration at `/slack/*` for commands and events
- PIN authentication at `/auth/pin` for kiosk devices
- Admin routes at `/admin/*` (user management, kiosk device management)
- Database schema in `src/db/schema.ts` with migrations in `src/db/migrations/`
- Session management: OAuth sessions stored in KV with D1 backup, PIN sessions in D1 only
- **Important**: PIN sessions cannot access admin routes (enforced in `middleware/auth.ts`)

**G3ID Web App** (`apps/g3id/`)
- Plugin-based architecture: each feature is a plugin with routes and nav items
- Color system centralized in `packages/ui/src/index.css` using Tailwind v4 `@theme` block
- Primary color: #A32035 (burgundy), Secondary: neutral grays (#f8f8f8–#1a1a1a)
- Navbar updates auth state on every route change (useLocation dependency)

### Color Implementation

All colors defined in `packages/ui/src/index.css` `@theme` block:
- Primary palette (burgundy): primary-50 through primary-900
- Secondary palette (neutral grays): secondary-50 through secondary-900
- Used across all apps via Tailwind classes
- **Do not use hardcoded colors** — use the `@theme` palette

### Database Schema

Key tables in D1:
- `core_users` — user accounts with status (pending/active/rejected)
- `core_user_identities` — linked auth providers per user
- `core_sessions` — active sessions (deprecated in favor of KV)
- `core_user_pins` — 3-digit PINs for kiosk login
- `kiosk_devices` — registered shop devices with tokens
- `kiosk_activation_codes` — 6-digit codes for device activation (30-min expiry)
- `core_slack_link_codes` — Slack auth codes with polling status

Migrations are SQL files in `workers/g3id/src/db/migrations/` — always add new migrations for schema changes.

### Slack Integration

Three flows:
1. **Sign-in**: User runs `/signin 123456` with a code from the web app
2. **Link**: Authenticated user runs `/link 123456` to add Slack to their account
3. **Events**: Slack bot receives 6-digit codes via DM and processes them

Routes:
- `POST /slack/events` — Slack event API (URL verification, DM messages)
- `POST /slack/commands/signin` — `/signin` slash command
- `POST /slack/commands/link` — `/link` slash command
- `GET /auth/slack/initiate` — Start sign-in flow
- `GET /auth/slack/link` — Start linking flow
- `GET /auth/slack/status` — Poll for completion (frontend calls every 2s)

Rate limiting: 5 attempts per 15 minutes per Slack user (via KV).

### Kiosk System (Shop Devices)

PIN-based access for untrusted computers:
- 3-digit numeric PIN assigned per user
- Device activation via 6-digit code (admin-generated, 30-min expiry)
- Kiosk token stored in browser localStorage, validated on every request
- Sessions marked as `sessionType: 'pin'` to prevent admin access
- If token is invalid/revoked, app redirects to `/kiosk/activate`

## Common Tasks

**Add a new auth provider:**
1. Create route handler in `workers/g3id/src/routes/auth/<provider>.ts`
2. Export router and mount at `workers/g3id/src/index.ts` (line with `.route("/auth", ...)`)
3. Add login page/button to `apps/g3id/src/plugins/auth/`
4. Update NavBar filtering if needed

**Change colors:**
1. Edit `packages/ui/src/index.css` `@theme` block (primary-*/secondary-* only)
2. All apps auto-inherit via Tailwind configuration
3. Do not use hardcoded hex values in components

**Add admin feature:**
1. Add route to `workers/g3id/src/routes/admin.ts` (uses `requireAdmin` middleware)
2. **Remember**: PIN sessions will get 403 "Admin access not allowed from kiosk"
3. Protect via admin-only NavBar visibility

**Database schema change:**
1. Create migration file: `workers/g3id/src/db/migrations/000X_description.sql`
2. Update `workers/g3id/src/db/schema.ts` Drizzle definitions
3. Test locally: `wrangler d1 migrations apply <database-name> --local`

**Create dev accounts with email/password (as admin):**
```
GET http://localhost:8787/auth/dev/create-user?email=test@example.com&password=password123&name=TestUser
```
- Requires admin authentication (logged in as admin)
- Development environment only
- Query params: `email` (required), `password` (required, 8+ chars), `name` (optional, defaults to email prefix)
- Creates an active user immediately (no approval needed)
- New user can log into any app with their email/password

## Testing & Validation

**Before committing:**
```bash
pnpm biome check --write      # Fix all linting issues
pnpm -r --if-present typecheck  # Ensure TypeScript passes
pnpm -r --if-present test    # Run available tests
```

**Test Slack locally:**
- Sign-in codes generated and stored in D1
- Frontend polls `/auth/slack/status` every 2s
- Status persists in D1 (immediate, not KV eventual consistency)

**Test kiosk flow:**
- Admin generates 6-digit activation code
- Device enters code at `/kiosk/activate`
- Receives kiosk token, stores in localStorage
- PIN login at `/kiosk/login` requires valid token in header

## Development Servers

**Port assignments** (configured in `.dev-ports.json` and individual vite/wrangler configs):

Apps:
- `apps/g3id` → 5173
- `apps/shop` → 5174
- `apps/pit` → 5175
- `apps/web` → 5178
- `apps/skill-tree` → 5180
- `apps/attendance` → 5181

Workers (Wrangler):
- `workers/g3id` → 8787 (inspector: 9229)
- `workers/shop` → 8788 (inspector: 9230)
- `workers/pit` → 8789 (inspector: 9231)
- `workers/skill-tree` → 8790 (inspector: 9232)
- `workers/attendance` → 8791 (inspector: 9233)

**Starting dev servers:**
- `pnpm dev` — Start all servers and print port summary after ready
- `pnpm dev:silent` — Start all servers without port printer

**Port conflicts:**
If you see "Address already in use" errors, kill zombie processes:
```bash
fuser -k 8787 8788 8789 8790 8791 9229 9230 9231 9232 9233
# or more aggressively:
killall -9 workerd wrangler node
```

**Adding a new port:**
1. Update the app/worker vite.config.ts or wrangler.toml with the new port
2. Add entry to `.dev-ports.json` in the appropriate section (apps or workers)
3. The port printer will automatically pick it up on next `pnpm dev`

## Adding New Apps and Workers

**Add a new app (React frontend):**
1. Create directory: `apps/<app-name>/`
2. Copy structure from an existing app (e.g., `apps/web/`)
3. Add unique port to `apps/<app-name>/vite.config.ts` (check `.dev-ports.json` for available ports)
4. Create `apps/<app-name>/package.json` with at minimum: `name`, `type: "module"`, `dev` script
5. Update `.dev-ports.json` with the new app and port
6. Add to root `pnpm-workspace.yaml` if not already globbed

**Add a new worker (Cloudflare backend):**
1. Create directory: `workers/<worker-name>/`
2. Copy structure from an existing worker (e.g., `workers/shop/`)
3. Add unique port and inspector-port to `workers/<worker-name>/wrangler.toml`
4. Set up D1 database bindings and KV namespace bindings in wrangler.toml
5. Create `workers/<worker-name>/package.json` with `name` and `dev` script
6. Update `.dev-ports.json` with the new worker, port, and inspectorPort
7. Add to root `pnpm-workspace.yaml` if not already globbed
8. If the worker needs to call other services, add service bindings in wrangler.toml

**Key differences from other systems:**
- Apps use Vite for dev server and build
- Workers use Wrangler for local dev (runs actual Cloudflare workerd runtime)
- All use Tailwind CSS v4 for styling (via `@g3/ui` package)
- All use TypeScript; monorepo-wide `pnpm typecheck` validates all

## Deployment

Workers deployed via Wrangler:
- `wrangler deploy` in each worker directory
- D1 database migrations run on deploy (see `wrangler.toml` in worker directories)
- Frontend apps deployed to Cloudflare Pages (via GitHub Actions)

## Key Files to Know

- `workers/g3id/src/middleware/auth.ts` — All auth middleware (requireAuth, requireAdmin, requireKioskToken)
- `workers/g3id/src/routes/auth/slack.ts` — Slack OAuth flow endpoints
- `workers/g3id/src/routes/slack.ts` — Slack slash commands and events
- `workers/g3id/src/lib/slack-code.ts` — Core Slack authentication logic
- `apps/g3id/src/shared/nav-bar.tsx` — Navigation bar with auth state management
- `packages/ui/src/index.css` — Tailwind theme and colors

## Updating This File

**When to update CLAUDE.md:**
- Major architectural changes (new systems, refactors)
- New common workflows or troubleshooting patterns emerge
- Database schema structure changes significantly
- New authentication flows added
- Color palette or styling approach changes
- Route structure or middleware patterns change

**How to update:**
1. Keep Architecture Overview in sync with actual code
2. Add new systems under "Key Systems" if they span multiple files
3. Document new auth flows in the Slack Integration / Kiosk System sections
4. Update Common Tasks if the process changes
5. Link to specific files when they're the source of truth
6. Remove outdated information — don't archive old systems

**Update checklist:**
- [ ] Verify all routes/paths still exist
- [ ] Check database schema reflects reality
- [ ] Ensure commands work as documented
- [ ] Validate color/theme documentation matches code
