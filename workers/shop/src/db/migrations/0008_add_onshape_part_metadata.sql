-- Add metadata columns to onshape_parts
ALTER TABLE onshape_parts ADD COLUMN revision TEXT;
ALTER TABLE onshape_parts ADD COLUMN name TEXT;
ALTER TABLE onshape_parts ADD COLUMN description TEXT;
