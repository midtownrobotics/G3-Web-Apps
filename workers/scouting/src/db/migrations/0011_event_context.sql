CREATE TABLE strategy_event_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  event_key TEXT NOT NULL DEFAULT '',
  current_match_number INTEGER,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE strategy_presence (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX strategy_presence_online_idx
  ON strategy_presence(is_admin, last_seen_at DESC);

CREATE TABLE tba_match_cache (
  event_key TEXT PRIMARY KEY,
  matches_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
