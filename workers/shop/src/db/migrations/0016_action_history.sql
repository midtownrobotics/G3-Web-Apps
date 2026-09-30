-- When a part instance was marked obsolete, for analytics (existing obsolete parts stay NULL).
ALTER TABLE "part_instances" ADD COLUMN "stale_at" integer;

-- The actions log is permanent history: rebuild it without foreign keys so parts and processes
-- can be deleted without touching it, and snapshot what each row refers to so it stays readable.
CREATE TABLE "actions_new" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "user_id" text NOT NULL,
  "part_instance_id" integer NOT NULL,
  "process_id" integer NOT NULL,
  "action" text NOT NULL,
  "created_at" integer NOT NULL,
  "part_definition_id" integer,
  "part_number" text,
  "part_name" text,
  "instance_number" integer,
  "process_name" text
);

INSERT INTO "actions_new"
  (id, user_id, part_instance_id, process_id, action, created_at,
   part_definition_id, part_number, part_name, instance_number, process_name)
SELECT a.id, a.user_id, a.part_instance_id, a.process_id, a.action, a.created_at,
       pi.part_definition_id, pd.onshape_part_number, pd.name, pi.instance_number, p.name
FROM actions a
LEFT JOIN part_instances pi ON pi.id = a.part_instance_id
LEFT JOIN part_definitions pd ON pd.id = pi.part_definition_id
LEFT JOIN processes p ON p.id = a.process_id;

DROP TABLE "actions";
ALTER TABLE "actions_new" RENAME TO "actions";
CREATE INDEX "actions_created_at_idx" ON "actions" ("created_at");
CREATE INDEX "actions_part_instance_idx" ON "actions" ("part_instance_id", "process_id");
