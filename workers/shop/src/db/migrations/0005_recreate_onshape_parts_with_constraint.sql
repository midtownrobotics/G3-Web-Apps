-- Drop the unique index from 0004
DROP INDEX IF EXISTS idx_onshape_parts_release_part;

-- Recreate the table with proper unique constraint
ALTER TABLE onshape_parts RENAME TO onshape_parts_old;

CREATE TABLE onshape_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT,
  part_drawing_entity_id TEXT,
  onshape_release_id TEXT NOT NULL,
  release_id INTEGER REFERENCES onshape_releases(id),
  part_number TEXT NOT NULL,
  version_id TEXT,
  quantity INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (onshape_release_id, part_number)
);

INSERT INTO onshape_parts SELECT * FROM onshape_parts_old;
DROP TABLE onshape_parts_old;
