ALTER TABLE scouting_form_submissions
  ADD COLUMN starred_fields_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX scouting_submissions_team_event_starred_idx
  ON scouting_form_submissions(team_name, event_key, starred_fields_json, created_at DESC);
