CREATE TABLE manual_scan_cache (
  content_hash TEXT PRIMARY KEY,
  result_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE manual_scan_usage (
  user_id TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_started_at)
);

CREATE INDEX manual_scan_cache_expiry_idx ON manual_scan_cache(expires_at);
