CREATE INDEX IF NOT EXISTS scouting_submissions_event_created_idx
  ON scouting_form_submissions(event_key, created_at DESC);

CREATE INDEX IF NOT EXISTS scouting_submissions_form_created_idx
  ON scouting_form_submissions(form_id, created_at DESC);

CREATE INDEX IF NOT EXISTS service_tickets_team_event_updated_idx
  ON service_tickets(team_name, event_key, updated_at DESC);

CREATE INDEX IF NOT EXISTS service_tickets_status_updated_idx
  ON service_tickets(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS team_comments_event_created_idx
  ON team_comments(event_key, created_at DESC);
