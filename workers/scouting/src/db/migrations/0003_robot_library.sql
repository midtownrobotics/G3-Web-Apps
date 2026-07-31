CREATE TABLE robot_teams (
  id TEXT PRIMARY KEY NOT NULL,
  team_name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE robot_images (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (team_id) REFERENCES robot_teams(id) ON DELETE CASCADE
);

CREATE INDEX robot_teams_updated_idx ON robot_teams(updated_at DESC);
CREATE INDEX robot_images_team_idx ON robot_images(team_id, created_at DESC);
