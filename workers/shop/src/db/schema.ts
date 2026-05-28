import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const subsystems = sqliteTable("subsystems", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: integer("created_at"),
});

export const partDefinitions = sqliteTable("part_definitions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  onshapePartNumber: text("onshape_part_number").notNull(),
  revision: text("revision").notNull(),
  subsystemId: integer("subsystem_id")
    .notNull()
    .references(() => subsystems.id),
  creator: text("creator").notNull(),
  name: text("name").notNull(),
  notes: text("notes"),
  partDrawingUrl: text("part_drawing_url"),
  createdAt: integer("created_at"),
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
    createdAt: integer("created_at"),
  },
  (t) => [unique().on(t.partDefinitionId, t.instanceNumber)],
);

export const processes = sqliteTable("processes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: integer("created_at"),
});

export const partProcesses = sqliteTable(
  "part_processes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    partInstanceId: integer("part_instance_id")
      .notNull()
      .references(() => partInstances.id),
    processId: integer("process_id")
      .notNull()
      .references(() => processes.id),
    status: text("status", { enum: ["waiting", "todo", "doing", "done"] })
      .notNull()
      .default("waiting"),
    index: integer("index").notNull(),
    completedAt: integer("completed_at"),
    createdAt: integer("created_at"),
  },
  (t) => [unique().on(t.partInstanceId, t.index)],
);
