CREATE TABLE checklist_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES checklist_lists(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL
);
