CREATE TABLE tba_team_cache (
  event_key TEXT PRIMARY KEY NOT NULL,
  teams_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
