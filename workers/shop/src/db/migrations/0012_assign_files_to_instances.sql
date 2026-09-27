-- Files are now assigned to individual part instances instead of whole part revisions.
-- Existing files stay in the library, unassigned.
DROP TABLE part_file_links;

-- Each instance has at most one file; a file can cover many instances across parts.
CREATE TABLE part_instance_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  part_instance_id INTEGER NOT NULL UNIQUE REFERENCES part_instances(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_part_instance_files_file ON part_instance_files(file_id);
