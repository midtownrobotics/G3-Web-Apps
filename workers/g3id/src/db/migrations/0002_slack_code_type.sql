-- Recreate core_slack_link_codes with nullable user_id, type, polling_token, and unique code

DROP TABLE core_slack_link_codes;

CREATE TABLE core_slack_link_codes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES core_users(id),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('signin', 'link')),
  polling_token TEXT,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1)),
  created_at INTEGER NOT NULL
);
