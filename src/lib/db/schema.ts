import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersSync as usersTable } from "drizzle-orm/neon";

export { usersTable };

export const projectsTable = pgTable("projects_table", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  repoId: text("repo_id").notNull(),
  neonProjectId: text("neon_project_id").notNull(),
  threadId: text("thread_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

export type InsertUser = typeof usersTable.$inferInsert;
export type SelectUser = typeof usersTable.$inferSelect;
export type InsertProject = typeof projectsTable.$inferInsert;
export type SelectProject = typeof projectsTable.$inferSelect;
