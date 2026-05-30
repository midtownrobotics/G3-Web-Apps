import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const checklistLists = sqliteTable("checklist_lists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at").notNull(),
});

export const checklistItems = sqliteTable("checklist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  listId: integer("list_id")
    .notNull()
    .references(() => checklistLists.id),
  index: integer("index").notNull(),
  type: text("type", { enum: ["item", "topic"] })
    .notNull()
    .default("item"),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at").notNull(),
});
