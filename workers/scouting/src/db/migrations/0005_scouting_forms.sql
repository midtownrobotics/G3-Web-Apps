CREATE TABLE scouting_forms (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  fields_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE scouting_form_submissions (
  id TEXT PRIMARY KEY NOT NULL,
  form_id TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  drawing_r2_key TEXT,
  drawing_content_type TEXT,
  submitted_by TEXT NOT NULL,
  submitted_by_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (form_id) REFERENCES scouting_forms(id) ON DELETE CASCADE
);

CREATE INDEX scouting_forms_updated_idx ON scouting_forms(updated_at DESC);
CREATE INDEX scouting_form_submissions_form_idx ON scouting_form_submissions(form_id, created_at DESC);
