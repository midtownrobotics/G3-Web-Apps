CREATE TABLE team_comments (
  id TEXT PRIMARY KEY NOT NULL,
  team_name TEXT NOT NULL,
  comment TEXT NOT NULL,
  event_key TEXT,
  source_ticket_id TEXT,
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX team_comments_team_event_idx
  ON team_comments(team_name, event_key, created_at DESC);
