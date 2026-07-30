-- Make revision and name columns nullable in part_definitions
ALTER TABLE part_definitions MODIFY revision TEXT;
ALTER TABLE part_definitions MODIFY name TEXT;
