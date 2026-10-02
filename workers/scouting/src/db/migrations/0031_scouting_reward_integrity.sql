CREATE TRIGGER scouting_submission_one_per_match
BEFORE INSERT ON scouting_form_submissions
WHEN (SELECT form_kind FROM scouting_forms WHERE id = NEW.form_id) = 'scouting'
  AND EXISTS (
    SELECT 1
      FROM scouting_form_submissions existing
      JOIN scouting_forms existing_form ON existing_form.id = existing.form_id
     WHERE existing_form.form_kind = 'scouting'
       AND existing.submitted_by = NEW.submitted_by
       AND existing.event_key = NEW.event_key
       AND existing.match_number = NEW.match_number
  )
BEGIN
  SELECT RAISE(ABORT, 'one scouting submission per match');
END;
