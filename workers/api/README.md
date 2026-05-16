# @g3/api

Main API — single Hono Worker with internally-mounted modules.

**Pattern:** Each feature lives in `src/modules/{name}/` and exports an `ApiModule` with `{ name, basePath, router }`. Modules are registered in `src/modules.config.ts` and mounted in `src/index.ts`.

Adding a module: create a folder, export the `ApiModule`, add one line to `modules.config.ts`.

**Planned modules:** inventory, sponsors, media, scouting, match-strategy.

Not yet implemented.
