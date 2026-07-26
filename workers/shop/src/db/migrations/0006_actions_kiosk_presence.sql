CREATE TABLE actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  part_instance_id INTEGER NOT NULL REFERENCES part_instances(id),
  process_id INTEGER NOT NULL REFERENCES processes(id),
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE kiosk_presence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_device_id INTEGER NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
