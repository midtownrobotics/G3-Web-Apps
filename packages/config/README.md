# @g3/config

Single source of truth for team- and domain-specific values. To run these apps for another team, edit
`team.json`: team info and links, `rootDomain`, each app's/worker's subdomain and dev port, and external URLs.

Names: each `apps.<app>.name` is that app's display name (navbar, page title, PWA name, e.g. "G3 Shop", "G3ID").
`team.name` is the full team name, `team.shortName` is highlighted inside the G3ID name, `team.slackBotName` is the
Slack bot's display name shown in login instructions, and `team.siteDescription` is every app's
`<meta name="description">`. In `index.html`, use `%APP_NAME:<app>%`, `%TEAM_NAME%`, `%TEAM_NUMBER%` and
`%SITE_DESCRIPTION%` (filled by the `teamBranding()` Vite plugin).

Images: `assets/` holds the team logo (`logo.png`, also the favicon) and PWA icons (`apple-touch-icon.png`,
`pwa-192x192.png`, `pwa-512x512.png`). `teamBranding()` serves them at every app's root, so replace these files to rebrand.

`extraHosts` lists additional subdomains served by the same app (attendance serves both `signin.` and `signout.`, picking the kiosk mode from the hostname).

- `@g3/config` — shared helpers (`appUrl`, `apiUrl`, `allowedOrigin`, `cookieDomain`, `isTeamHostname`, …). Safe in Workers and browsers.
- `@g3/config/client` — browser-only helpers that pick dev vs. prod URLs from `import.meta.env` (`apiBase`, `linkTo`, `workerUrl`, `loginUrl`).
- `src/vite.ts` — Vite config helpers (`devServer`, `apiRequestMatcher`, `teamBranding`). Import by relative path (`../../packages/config/src/vite`), since Vite loads configs with plain Node.

Dev overrides: `VITE_API_BASE_URL` and `VITE_G3ID_URL` in an app's `.env.development.local` (e.g. for a tunnel).
