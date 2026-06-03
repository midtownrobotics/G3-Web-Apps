CREATE TABLE batteries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'Idle',
  state_since INTEGER NOT NULL,
  voltage REAL,
  created_at INTEGER NOT NULL
);
