CREATE TABLE drawings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_number TEXT NOT NULL,
  filename TEXT NOT NULL,
  r2_url TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_drawings_part_number ON drawings(part_number);
