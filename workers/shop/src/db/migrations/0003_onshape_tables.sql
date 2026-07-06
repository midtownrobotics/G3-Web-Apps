CREATE TABLE onshape_releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id TEXT NOT NULL UNIQUE,
  timestamp TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE onshape_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT,
  part_drawing_entity_id TEXT,
  onshape_release_id TEXT NOT NULL,
  release_id INTEGER REFERENCES onshape_releases(id),
  part_number TEXT NOT NULL,
  version_id TEXT,
  quantity INTEGER,
  created_at INTEGER NOT NULL
);
