-- Add isObsolete column to part_definitions
ALTER TABLE "part_definitions" ADD COLUMN "is_obsolete" integer NOT NULL DEFAULT 0;
