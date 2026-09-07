CREATE TABLE strategy_announcements (
  id TEXT PRIMARY KEY NOT NULL,
  message TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX strategy_announcements_active_idx
  ON strategy_announcements(expires_at DESC, created_at DESC);
