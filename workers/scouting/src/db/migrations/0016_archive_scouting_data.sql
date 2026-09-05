ALTER TABLE scouting_form_submissions ADD COLUMN archived_at INTEGER;
ALTER TABLE scouting_form_submissions ADD COLUMN archived_by TEXT;
ALTER TABLE scouting_form_submissions ADD COLUMN archive_reason TEXT;

CREATE INDEX scouting_submissions_archive_idx
  ON scouting_form_submissions(archived_at, team_name, event_key, created_at DESC);
