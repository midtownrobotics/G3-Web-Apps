CREATE TABLE scouting_match_assignments_next (
  event_key TEXT NOT NULL,
  match_number INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  team_number TEXT NOT NULL,
  assigned_at INTEGER NOT NULL,
  PRIMARY KEY (event_key, match_number, user_id)
);

INSERT INTO scouting_match_assignments_next
  (event_key, match_number, user_id, team_number, assigned_at)
SELECT event_key, match_number, user_id, team_number, assigned_at
FROM scouting_match_assignments;

DROP TABLE scouting_match_assignments;
ALTER TABLE scouting_match_assignments_next RENAME TO scouting_match_assignments;

CREATE INDEX scouting_match_assignments_match_idx
  ON scouting_match_assignments(event_key, match_number);
