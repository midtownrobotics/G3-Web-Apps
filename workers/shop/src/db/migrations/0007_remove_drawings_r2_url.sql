-- Drop r2_url column (URLs will be constructed in frontend from drawing ID)
CREATE TABLE drawings_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_number TEXT NOT NULL,
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by TEXT,
  created_at INTEGER NOT NULL
);

INSERT INTO drawings_new (id, part_number, filename, r2_key, file_size, uploaded_by, created_at)
SELECT id, part_number, filename, r2_key, file_size, uploaded_by, created_at FROM drawings;

DROP TABLE drawings;
ALTER TABLE drawings_new RENAME TO drawings;

CREATE INDEX idx_drawings_part_number ON drawings(part_number);
