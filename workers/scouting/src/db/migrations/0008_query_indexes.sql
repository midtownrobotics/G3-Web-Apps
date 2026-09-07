CREATE INDEX scouting_submissions_team_lower_idx
  ON scouting_form_submissions(LOWER(team_name), created_at DESC);

CREATE INDEX scouting_shifts_reminder_idx
  ON scouting_shifts(reminder_sent_at, starts_at)
  WHERE reminder_sent_at IS NULL AND slack_user_id IS NOT NULL;

CREATE INDEX service_tickets_priority_idx
  ON service_tickets(status, created_at DESC);
