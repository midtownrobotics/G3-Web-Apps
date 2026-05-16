# @g3/db

Drizzle ORM schema and typed client factory for the D1 database.

**Conventions:**
- Tables are prefixed by module: `inventory_*`, `sponsors_*`, `scouting_*`, etc.
- Migrations are append-only SQL files. Never edit a merged migration.
- Every table has `id` (UUID text), `created_at`, `updated_at`, `deleted_at`.

Not yet implemented.
