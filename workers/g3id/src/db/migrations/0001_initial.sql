-- Initial schema migration

CREATE TABLE core_users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'rejected', 'merged')),
  merged_into_user_id TEXT REFERENCES core_users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE core_user_identities (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES core_users(id),
  provider TEXT NOT NULL CHECK (provider IN ('local', 'google', 'slack', 'github', 'onshape')),
  provider_id TEXT,
  password_hash TEXT, -- Argon2 hash; implementation pending
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at INTEGER,
  token_scopes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (provider, provider_id)
);

CREATE TABLE core_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES core_users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE core_slack_link_codes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES core_users(id),
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1)),
  created_at INTEGER NOT NULL
);
