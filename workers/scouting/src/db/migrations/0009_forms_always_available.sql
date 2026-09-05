UPDATE scouting_forms
SET is_active = 1
WHERE form_kind IN ('scouting', 'pit');
