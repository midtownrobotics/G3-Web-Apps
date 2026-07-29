CREATE TABLE tier_lists (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tiers_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE field_maps (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  event_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE auto_routines (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  robot_name TEXT NOT NULL DEFAULT '',
  start_position TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  steps_json TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX tier_lists_updated_idx ON tier_lists(updated_at DESC);
CREATE INDEX field_maps_updated_idx ON field_maps(updated_at DESC);
CREATE INDEX auto_routines_updated_idx ON auto_routines(updated_at DESC);
