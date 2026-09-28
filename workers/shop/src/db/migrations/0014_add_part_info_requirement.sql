-- Processes can require extra part information (material + thickness) at ingest, e.g. a
-- laser or waterjet that needs to know stock. Stored on the part definition as free text.
ALTER TABLE processes ADD COLUMN requires_part_info INTEGER NOT NULL DEFAULT 0;
ALTER TABLE part_definitions ADD COLUMN material TEXT;
ALTER TABLE part_definitions ADD COLUMN thickness TEXT;
