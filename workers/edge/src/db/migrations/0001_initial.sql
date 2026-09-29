-- Core: status of the (single) edge box, updated on every agent request.
CREATE TABLE edge_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  agent_version TEXT NOT NULL,
  agent_started_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE edge_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  user_display_name TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);

-- Network module. "mac" is a lowercase MAC, "_wan" (total WAN bytes incl. the
-- box's own traffic), or "ip:<addr>" for traffic from an IP with no DHCP lease.
CREATE TABLE net_clients (
  mac TEXT PRIMARY KEY,
  hostname TEXT,
  display_name TEXT,
  last_ip TEXT,
  is_infrastructure INTEGER NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- 5-minute buckets; ts is the bucket start (unix seconds).
CREATE TABLE net_usage (
  mac TEXT NOT NULL,
  ts INTEGER NOT NULL,
  dl_bytes INTEGER NOT NULL,
  ul_bytes INTEGER NOT NULL,
  PRIMARY KEY (ts, mac)
);

-- Hourly rollup of net_usage rows older than the raw retention window.
CREATE TABLE net_usage_hourly (
  mac TEXT NOT NULL,
  ts INTEGER NOT NULL,
  dl_bytes INTEGER NOT NULL,
  ul_bytes INTEGER NOT NULL,
  PRIMARY KEY (ts, mac)
);

CREATE INDEX idx_net_usage_mac_ts ON net_usage (mac, ts);
CREATE INDEX idx_net_usage_hourly_mac_ts ON net_usage_hourly (mac, ts);

CREATE TABLE net_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cap_bytes INTEGER NOT NULL,
  cycle_start_day INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO net_settings (id, cap_bytes, cycle_start_day, updated_at)
VALUES (1, 50000000000, 1, unixepoch());
