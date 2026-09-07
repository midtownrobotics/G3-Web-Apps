CREATE TABLE strategy_admins (
  user_id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

ALTER TABLE scouting_forms ADD COLUMN form_kind TEXT NOT NULL DEFAULT 'scouting';
ALTER TABLE scouting_form_submissions ADD COLUMN team_name TEXT NOT NULL DEFAULT '';
ALTER TABLE scouting_form_submissions ADD COLUMN drawing_fields_json TEXT NOT NULL DEFAULT '{}';

-- Preserve earlier custom forms and their submissions without showing them in the two fixed workflows.
UPDATE scouting_forms SET form_kind = 'legacy';

INSERT OR IGNORE INTO scouting_forms (id, name, description, fields_json, is_active, created_by, created_at, updated_at, form_kind)
VALUES ('form_scouting', 'Scouting', 'Record match performance and observations.', '[]', 1, 'system', 0, 0, 'scouting');

INSERT OR IGNORE INTO scouting_forms (id, name, description, fields_json, is_active, created_by, created_at, updated_at, form_kind)
VALUES ('form_pit_scouting', 'Pit Scouting', 'Record robot details from the pits.', '[]', 1, 'system', 0, 0, 'pit');

CREATE INDEX strategy_admins_email_idx ON strategy_admins(email);
CREATE INDEX scouting_form_submissions_team_idx ON scouting_form_submissions(team_name, created_at DESC);
