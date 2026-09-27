# @g3/config

Single source of truth for team- and domain-specific values. To run these apps for another team, edit
`team.json`: team info and links, `rootDomain`, each app's/worker's subdomain and dev port, and external URLs.

- `@g3/config` — shared helpers (`appUrl`, `apiUrl`, `allowedOrigin`, `cookieDomain`, `isTeamHostname`, …). Safe in Workers and browsers.
- `@g3/config/client` — browser-only helpers that pick dev vs. prod URLs from `import.meta.env` (`apiBase`, `linkTo`, `workerUrl`, `loginUrl`).
- `src/vite.ts` — Vite config helpers. Import by relative path (`../../packages/config/src/vite`), since Vite loads configs with plain Node.

Dev overrides: `VITE_API_BASE_URL` and `VITE_G3ID_URL` in an app's `.env.development.local` (e.g. for a tunnel).
