# Contributing

## Setup

```bash
git clone https://github.com/g3robotics/g3-web-apps.git
cd g3-web-apps
pnpm install
pnpm dev        # starts apps/web dev server
```

## Branch naming

| Type | Pattern | Example |
|---|---|---|
| Feature | `feat/short-description` | `feat/sponsors-page` |
| Bug fix | `fix/short-description` | `fix/nav-active-state` |
| Maintenance | `chore/short-description` | `chore/upgrade-react` |
| Docs | `docs/short-description` | `docs/plugin-guide` |

Branch off `main`. Keep branches short-lived.

## Pull requests

Every PR needs:

1. **Title** in conventional commit format — this becomes the squash commit message.
   - `feat(web): add sponsors plugin`
   - `fix(web): correct nav item ordering`
2. **Description:** What, Why, How to test.
3. **Screenshots** for any UI change. No exceptions.

PRs merge via squash. `main` history stays clean.

## Commit message format

```
<type>(<scope>): <subject>

<optional body — wrap at 72 chars>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`.

## Running checks locally

```bash
pnpm lint       # Biome format + lint check
pnpm typecheck  # TypeScript across all packages
pnpm test       # Tests across all packages
```

All three must pass before a PR can merge. CI runs them automatically.

## Adding a plugin to apps/web

1. Create `apps/web/src/plugins/{name}/`
2. Add `index.tsx` exporting a `Plugin` object (see `shared/plugin-types.ts`)
3. Add `README.md` describing what the plugin does
4. Add one import + one entry to `apps/web/src/plugins.config.ts`

Do not touch `app.tsx`.

## Naming conventions

- **Files and folders:** kebab-case — `home-page.tsx`, `use-sponsors.ts`
- **React components:** PascalCase — `HomePage`, `SponsorCard`
- **Functions and variables:** camelCase — `getTeamMatches`, `navItems`
- **Types and interfaces:** PascalCase — `Plugin`, `PluginRoute`
- **Full words, no abbreviations** — `inventory` not `inv`, `sponsors` not `spon`
  - Allowed abbreviations: `api`, `db`, `ui`, `id`, `url`, `frc`, `tba`
