ALTER TABLE strategy_event_config ADD COLUMN schedule_mode TEXT NOT NULL DEFAULT 'tba';

CREATE TABLE manual_events (
  event_key TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  ends_at INTEGER NOT NULL,
  delete_after INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE manual_teams (
  event_key TEXT NOT NULL,
  team_number TEXT NOT NULL,
  team_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (event_key, team_number),
  FOREIGN KEY (event_key) REFERENCES manual_events(event_key) ON DELETE CASCADE
);

CREATE TABLE manual_matches (
  event_key TEXT NOT NULL,
  match_key TEXT NOT NULL,
  comp_level TEXT NOT NULL DEFAULT 'qm',
  set_number INTEGER NOT NULL DEFAULT 1,
  match_number INTEGER NOT NULL,
  scheduled_at INTEGER,
  red_1 TEXT NOT NULL,
  red_2 TEXT NOT NULL,
  red_3 TEXT NOT NULL,
  blue_1 TEXT NOT NULL,
  blue_2 TEXT NOT NULL,
  blue_3 TEXT NOT NULL,
  PRIMARY KEY (event_key, match_key),
  FOREIGN KEY (event_key) REFERENCES manual_events(event_key) ON DELETE CASCADE
);

CREATE INDEX manual_events_cleanup_idx ON manual_events(delete_after);
CREATE INDEX manual_matches_order_idx ON manual_matches(event_key, comp_level, match_number);
