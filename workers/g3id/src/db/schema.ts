import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

export const coreUsers = sqliteTable(
  "core_users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull(),
    isAdmin: integer("is_admin").notNull().default(0),
    mergedIntoUserId: text("merged_into_user_id").references((): AnySQLiteColumn => coreUsers.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    lastLoginAt: integer("last_login_at"),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    check(
      "core_users_status_check",
      sql`${table.status} IN ('pending', 'active', 'rejected', 'merged')`,
    ),
  ],
);

export const coreUserIdentities = sqliteTable(
  "core_user_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => coreUsers.id),
    provider: text("provider").notNull(),
    providerId: text("provider_id"),
    passwordHash: text("password_hash"), // Argon2 hash — implementation pending
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: integer("token_expires_at"),
    tokenScopes: text("token_scopes"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "core_user_identities_provider_check",
      sql`${table.provider} IN ('local', 'google', 'slack', 'github', 'onshape', 'steam')`,
    ),
    unique("core_user_identities_provider_provider_id_uniq").on(table.provider, table.providerId),
  ],
);

export const coreSessions = sqliteTable("core_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => coreUsers.id),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const coreSlackLinkCodes = sqliteTable(
  "core_slack_link_codes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => coreUsers.id), // null for signin codes
    code: text("code").notNull().unique(),
    type: text("type").notNull(),
    pollingToken: text("polling_token"),
    expiresAt: integer("expires_at").notNull(),
    used: integer("used").notNull().default(0),
    status: text("status").notNull().default("pending"), // pending, success, failed, linked, signup_pending
    statusMessage: text("status_message"), // error message if status is 'failed'
    sessionId: text("session_id"), // session ID if status is 'success'
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    check("core_slack_link_codes_type_check", sql`${table.type} IN ('signin', 'link')`),
    check("core_slack_link_codes_status_check", sql`${table.status} IN ('pending', 'success', 'failed', 'linked', 'signup_pending')`),
  ],
);
