-- Phase 2: blocklists, time-limited exceptions ("grants"), and master switches.
-- Every change bumps net_settings.state_version; the agent reports the version
-- it has applied, so the UI can show changes as pending until then.

ALTER TABLE edge_status ADD COLUMN applied_state_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE net_settings ADD COLUMN enforce INTEGER NOT NULL DEFAULT 0;
ALTER TABLE net_settings ADD COLUMN dns_hardening INTEGER NOT NULL DEFAULT 0;
ALTER TABLE net_settings ADD COLUMN state_version INTEGER NOT NULL DEFAULT 1;

-- Admin-made domain lists. "block" rejects traffic to the list's sites;
-- "throttle" limits each device's download from them to rate_kbps.
CREATE TABLE net_blocklists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('block', 'throttle')),
  rate_kbps INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- A domain matches itself and all its subdomains.
CREATE TABLE net_blocklist_domains (
  blocklist_id INTEGER NOT NULL REFERENCES net_blocklists (id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  PRIMARY KEY (blocklist_id, domain)
);

-- Lets one device (by MAC) past one blocklist, or all of them when
-- blocklist_id is NULL, until expires_at.
CREATE TABLE net_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mac TEXT NOT NULL,
  blocklist_id INTEGER REFERENCES net_blocklists (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  reason TEXT,
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX idx_net_grants_expires ON net_grants (expires_at);
