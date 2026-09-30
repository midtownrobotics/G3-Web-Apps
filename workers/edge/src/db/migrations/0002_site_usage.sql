-- Per-site usage (admin-only in the UI). "site" is a registrable domain such as
-- "googlevideo.com", or "(unknown)" / "(other)". ts is the hour start (unix seconds).
CREATE TABLE net_site_usage (
  mac TEXT NOT NULL,
  ts INTEGER NOT NULL,
  site TEXT NOT NULL,
  dl_bytes INTEGER NOT NULL,
  ul_bytes INTEGER NOT NULL,
  PRIMARY KEY (ts, mac, site)
);

CREATE INDEX idx_net_site_usage_site_ts ON net_site_usage (site, ts);
CREATE INDEX idx_net_site_usage_mac_ts ON net_site_usage (mac, ts);

-- Daily rollup of hourly rows older than 30 days; kept for a year. ts is the
-- day start in US Eastern standard time (UTC-5), so DST days are off by an hour.
CREATE TABLE net_site_usage_daily (
  mac TEXT NOT NULL,
  ts INTEGER NOT NULL,
  site TEXT NOT NULL,
  dl_bytes INTEGER NOT NULL,
  ul_bytes INTEGER NOT NULL,
  PRIMARY KEY (ts, mac, site)
);

CREATE INDEX idx_net_site_usage_daily_site_ts ON net_site_usage_daily (site, ts);
CREATE INDEX idx_net_site_usage_daily_mac_ts ON net_site_usage_daily (mac, ts);
