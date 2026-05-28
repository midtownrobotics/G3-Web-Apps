CREATE TABLE subsystems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER
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
  created_at INTEGER
);

CREATE TABLE part_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_definition_id INTEGER NOT NULL REFERENCES part_definitions(id),
  instance_number INTEGER NOT NULL,
  is_priority INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER,
  UNIQUE (part_definition_id, instance_number)
);

CREATE TABLE processes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER
);

CREATE TABLE part_processes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_instance_id INTEGER NOT NULL REFERENCES part_instances(id),
  process_id INTEGER NOT NULL REFERENCES processes(id),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'todo', 'doing', 'done')),
  "index" INTEGER NOT NULL,
  completed_at INTEGER,
  created_at INTEGER,
  UNIQUE (part_instance_id, "index")
);
