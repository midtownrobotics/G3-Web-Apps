ALTER TABLE core_slack_link_codes ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE core_slack_link_codes ADD COLUMN status_message TEXT;
ALTER TABLE core_slack_link_codes ADD COLUMN session_id TEXT;

CREATE TABLE core_slack_link_codes_new (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES core_users(id),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  polling_token TEXT,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  status_message TEXT,
  session_id TEXT,
  created_at INTEGER NOT NULL,
  CHECK (type IN ('signin', 'link')),
  CHECK (status IN ('pending', 'success', 'failed', 'linked', 'signup_pending'))
);

INSERT INTO core_slack_link_codes_new
SELECT id, user_id, code, type, polling_token, expires_at, used, status, status_message, session_id, created_at
FROM core_slack_link_codes;

DROP TABLE core_slack_link_codes;
ALTER TABLE core_slack_link_codes_new RENAME TO core_slack_link_codes;
