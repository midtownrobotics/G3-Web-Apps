CREATE TABLE service_helpers (
  user_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  slack_user_id TEXT,
  skills_json TEXT NOT NULL DEFAULT '[]',
  approved_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE service_tickets (
  id TEXT PRIMARY KEY NOT NULL,
  team_name TEXT NOT NULL,
  issue_type TEXT NOT NULL CHECK (issue_type IN ('mechanical', 'electrical', 'programming', 'other')),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'closed')),
  claimed_by TEXT,
  claimed_by_name TEXT,
  resolution TEXT,
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE scouting_shifts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  slack_user_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('scout', 'helper')),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  reminder_sent_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE scouting_rewards (
  user_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  submissions INTEGER NOT NULL DEFAULT 0,
  tickets_closed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX service_tickets_status_idx ON service_tickets(status, created_at DESC);
CREATE INDEX scouting_shifts_start_idx ON scouting_shifts(starts_at, reminder_sent_at);
CREATE INDEX scouting_rewards_points_idx ON scouting_rewards(points DESC);
