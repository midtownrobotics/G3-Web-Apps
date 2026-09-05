ALTER TABLE scouting_form_submissions ADD COLUMN fields_json TEXT;

UPDATE scouting_form_submissions
SET fields_json = (
  SELECT scouting_forms.fields_json
  FROM scouting_forms
  WHERE scouting_forms.id = scouting_form_submissions.form_id
)
WHERE fields_json IS NULL;
