DROP TABLE IF EXISTS subsystems;
DROP TABLE IF EXISTS part_definitions;
DROP TABLE IF EXISTS part_instances;
DROP TABLE IF EXISTS processes;
DROP TABLE IF EXISTS part_processes;

CREATE TABLE subsystems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE part_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  onshape_part_number TEXT NOT NULL,
  revision TEXT NOT NULL,
  subsystem_id INTEGER NOT NULL REFERENCES subsystems(id),
  creator TEXT NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  part_drawing_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE part_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_definition_id INTEGER NOT NULL REFERENCES part_definitions(id),
  instance_number INTEGER NOT NULL,
  is_priority INTEGER NOT NULL DEFAULT 0,
  is_stale INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (part_definition_id, instance_number)
);

CREATE TABLE processes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE part_definition_process_blueprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_definition_id INTEGER NOT NULL REFERENCES part_definitions(id),
  process_id INTEGER NOT NULL REFERENCES processes(id),
  'index' INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (part_definition_id, 'index')
);

CREATE TABLE part_instance_processes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_instance_id INTEGER NOT NULL REFERENCES part_instances(id),
  process_id INTEGER NOT NULL REFERENCES processes(id),
  'index' INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'todo', 'doing', 'done')),
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (part_instance_id, 'index')
);
