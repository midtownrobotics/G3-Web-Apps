import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const subsystems = sqliteTable("subsystems", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const partDefinitions = sqliteTable("part_definitions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  onshapePartNumber: text("onshape_part_number").notNull(),
  revision: text("revision"),
  subsystemId: integer("subsystem_id")
    .notNull()
    .references(() => subsystems.id),
  creator: text("creator").notNull(),
  name: text("name"),
  notes: text("notes"),
  partDrawingUrl: text("part_drawing_url"),
  isObsolete: integer("is_obsolete").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const partInstances = sqliteTable(
  "part_instances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    partDefinitionId: integer("part_definition_id")
      .notNull()
      .references(() => partDefinitions.id),
    instanceNumber: integer("instance_number").notNull(),
    isPriority: integer("is_priority").notNull().default(0),
    isStale: integer("is_stale").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [unique().on(t.partDefinitionId, t.instanceNumber)],
);

export const processes = sqliteTable("processes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const partDefinitionProcessBlueprints = sqliteTable(
  "part_definition_process_blueprints",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    partDefinitionId: integer("part_definition_id")
      .notNull()
      .references(() => partDefinitions.id),
    processId: integer("process_id")
      .notNull()
      .references(() => processes.id),
    index: integer("index").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [unique().on(t.partDefinitionId, t.index)],
);

export const partInstanceProcesses = sqliteTable(
  "part_instance_processes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    partInstanceId: integer("part_instance_id")
      .notNull()
      .references(() => partInstances.id),
    processId: integer("process_id")
      .notNull()
      .references(() => processes.id),
    index: integer("index").notNull(),
    status: text("status", { enum: ["waiting", "todo", "doing", "done"] })
      .notNull()
      .default("waiting"),
    completedAt: integer("completed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [unique().on(t.partInstanceId, t.index)],
);

/** Audit log of who moved which part instance through which process. */
export const actions = sqliteTable("actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  partInstanceId: integer("part_instance_id")
    .notNull()
    .references(() => partInstances.id),
  processId: integer("process_id")
    .notNull()
    .references(() => processes.id),
  action: text("action", { enum: ["started", "completed"] }).notNull(),
  createdAt: integer("created_at").notNull(),
});

/** Who is currently logged in at each kiosk device (heartbeat-refreshed). */
export const kioskPresence = sqliteTable("kiosk_presence", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kioskDeviceId: integer("kiosk_device_id").notNull().unique(),
  deviceName: text("device_name").notNull(),
  userId: text("user_id").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const onshapeReleases = sqliteTable("onshape_releases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  releaseId: text("release_id").notNull().unique(),
  timestamp: text("timestamp").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const onshapeParts = sqliteTable(
  "onshape_parts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityId: text("entity_id"),
    partDrawingEntityId: text("part_drawing_entity_id"),
    onshapeReleaseId: text("onshape_release_id").notNull(),
    releaseId: integer("release_id").references(() => onshapeReleases.id),
    partNumber: text("part_number").notNull(),
    versionId: text("version_id"),
    quantity: integer("quantity"),
    revision: text("revision"),
    name: text("name"),
    description: text("description"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [unique().on(t.onshapeReleaseId, t.partNumber)],
);

export const drawings = sqliteTable("drawings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partNumber: text("part_number").notNull(),
  filename: text("filename").notNull(),
  r2Key: text("r2_key").notNull(),
  fileSize: integer("file_size"),
  uploadedBy: text("uploaded_by"),
  createdAt: integer("created_at").notNull(),
});

export const adminSettings = sqliteTable(
  "admin_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull().unique(),
    value: text("value").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [unique().on(t.key)],
);
