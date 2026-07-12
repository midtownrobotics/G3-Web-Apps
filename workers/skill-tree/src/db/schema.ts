import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One row per user that has a skill-tree profile (the "students" collection).
// `progress` is a JSON map of skillId -> "not-started" | "in-progress" | "complete".
export const skillProgress = sqliteTable("skill_progress", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  progress: text("progress", { mode: "json" })
    .notNull()
    .$type<Record<string, string>>()
    .default({}),
  updatedAt: integer("updated_at").notNull(),
});

// Membership table for mentors (the "mentors" collection — existence = mentor).
export const skillMentors = sqliteTable("skill_mentors", {
  userId: text("user_id").primaryKey(),
});
