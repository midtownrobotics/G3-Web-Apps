-- Arbitrary files (CAM, DXF, setup sheets, photos…) stored in R2 under part-files/.
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- A file can be linked to many part revisions. Keyed by part number + revision text rather
-- than part_definitions.id so files can be linked during ingest, before the definition exists.
CREATE TABLE part_file_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  part_number TEXT NOT NULL,
  revision TEXT NOT NULL,
  linked_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (file_id, part_number, revision)
);

CREATE INDEX idx_part_file_links_part ON part_file_links(part_number, revision);
