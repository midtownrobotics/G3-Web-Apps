# Skill Tree

FRC skill-tree progress tracker. Students work through discipline tracks
(Safety, Manufacturing, Design, …); skill nodes unlock as prerequisites are
completed, and the Safety tree gates all others.

This is intentionally **buildless vanilla JS** — no framework, no TypeScript.
Vite only serves the ES modules in dev and bundles them for production.

## Structure

- `index.html` — page structure and layout
- `style.css` — all styling
- `app.js` — layout engine, state, rendering, event handlers
- `data/trees.js` — the `TREES` definitions (edit this to change skills)
- `firebase.js` — backend shim (kept name for a clean diff). Despite the name it
  is **not** Firebase: it talks to G3ID for auth and the `skill-tree` worker for
  data, exposing the same function surface `app.js` expects. Firestore's realtime
  listener is emulated by polling.

## Backend

Auth and data are served by [`workers/skill-tree`](../../workers/skill-tree).
Auth is G3ID session cookies (shared across `*.g3robotics.com`). Mentors can edit
any student's progress; everyone else is read-only.

## Running

```
pnpm --filter @g3/skill-tree dev          # http://localhost:5180
pnpm --filter @g3/worker-skill-tree dev   # the API on :8790 (needs g3id on :8787)
```

`firebase.js` auto-targets `localhost` backends in dev and the
`*.g3robotics.com` backends in production.
