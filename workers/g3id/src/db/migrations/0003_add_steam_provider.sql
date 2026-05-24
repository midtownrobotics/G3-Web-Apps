-- SQLite cannot ALTER a CHECK constraint, so recreate the table with 'steam' added
PRAGMA foreign_keys = OFF;

CREATE TABLE core_user_identities_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES core_users(id),
  provider TEXT NOT NULL CHECK (provider IN ('local', 'google', 'slack', 'github', 'onshape', 'steam')),
  provider_id TEXT,
  password_hash TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at INTEGER,
  token_scopes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (provider, provider_id)
);

INSERT INTO core_user_identities_new SELECT * FROM core_user_identities;

DROP TABLE core_user_identities;

ALTER TABLE core_user_identities_new RENAME TO core_user_identities;

PRAGMA foreign_keys = ON;
