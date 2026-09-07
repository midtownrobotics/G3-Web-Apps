ALTER TABLE scouting_form_submissions ADD COLUMN event_key TEXT;
ALTER TABLE scouting_form_submissions ADD COLUMN match_key TEXT;
ALTER TABLE scouting_form_submissions ADD COLUMN match_number INTEGER;
ALTER TABLE service_tickets ADD COLUMN event_key TEXT;
ALTER TABLE service_tickets ADD COLUMN match_key TEXT;
ALTER TABLE service_tickets ADD COLUMN match_number INTEGER;
CREATE INDEX scouting_submissions_event_match_idx
  ON scouting_form_submissions(event_key, match_key, team_name, created_at DESC);
CREATE INDEX service_tickets_event_team_idx
  ON service_tickets(event_key, team_name, updated_at DESC);
