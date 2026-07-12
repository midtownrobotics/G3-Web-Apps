CREATE TABLE skill_progress (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  progress TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE TABLE skill_mentors (
  user_id TEXT PRIMARY KEY
);
