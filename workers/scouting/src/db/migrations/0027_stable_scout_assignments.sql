CREATE TABLE scouting_match_assignments (
  event_key TEXT NOT NULL,
  match_number INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  team_number TEXT NOT NULL,
  assigned_at INTEGER NOT NULL,
  PRIMARY KEY (event_key, match_number, user_id),
  UNIQUE (event_key, match_number, team_number)
);

CREATE INDEX scouting_match_assignments_match_idx
  ON scouting_match_assignments(event_key, match_number);
