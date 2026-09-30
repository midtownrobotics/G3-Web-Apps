import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const edgeStatus = sqliteTable("edge_status", {
  id: integer("id").primaryKey(),
  agentVersion: text("agent_version").notNull(),
  agentStartedAt: integer("agent_started_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});

export const edgeAudit = sqliteTable("edge_audit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  userDisplayName: text("user_display_name").notNull(),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: integer("created_at").notNull(),
});

export const netClients = sqliteTable("net_clients", {
  mac: text("mac").primaryKey(),
  hostname: text("hostname"),
  displayName: text("display_name"),
  lastIp: text("last_ip"),
  isInfrastructure: integer("is_infrastructure").notNull().default(0),
  firstSeenAt: integer("first_seen_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});

export const netUsage = sqliteTable(
  "net_usage",
  {
    mac: text("mac").notNull(),
    ts: integer("ts").notNull(),
    dlBytes: integer("dl_bytes").notNull(),
    ulBytes: integer("ul_bytes").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ts, t.mac] })],
);

export const netUsageHourly = sqliteTable(
  "net_usage_hourly",
  {
    mac: text("mac").notNull(),
    ts: integer("ts").notNull(),
    dlBytes: integer("dl_bytes").notNull(),
    ulBytes: integer("ul_bytes").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ts, t.mac] })],
);

export const netSettings = sqliteTable("net_settings", {
  id: integer("id").primaryKey(),
  capBytes: integer("cap_bytes").notNull(),
  cycleStartDay: integer("cycle_start_day").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Queried with raw SQL in modules/network/sites.ts (hourly and daily are unioned).
const siteUsageColumns = {
  mac: text("mac").notNull(),
  ts: integer("ts").notNull(),
  site: text("site").notNull(),
  dlBytes: integer("dl_bytes").notNull(),
  ulBytes: integer("ul_bytes").notNull(),
};

export const netSiteUsage = sqliteTable("net_site_usage", siteUsageColumns, (t) => [
  primaryKey({ columns: [t.ts, t.mac, t.site] }),
]);

export const netSiteUsageDaily = sqliteTable("net_site_usage_daily", siteUsageColumns, (t) => [
  primaryKey({ columns: [t.ts, t.mac, t.site] }),
]);
