import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  pgEnum,
  index,
  unique,
  boolean,
} from "drizzle-orm/pg-core";
import { usersSync as usersTable } from "drizzle-orm/neon";

export { usersTable };

export const aiProviderEnum = pgEnum("ai_provider", [
  "anthropic",
  "openai",
  "openrouter",
]);

export const projectsTable = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  repoId: text("repo_id").notNull(),
  neonProjectId: text("neon_project_id").notNull(),
  threadId: text("thread_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id),
  currentDevVersionId: uuid("current_dev_version_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

export const projectVersionsTable = pgTable("project_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projectsTable.id),
  gitCommitHash: text("git_commit_hash").notNull(),
  neonSnapshotId: text("neon_snapshot_id").notNull(),
  assistantMessageId: text("assistant_message_id"),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projectSecretsTable = pgTable("project_secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectVersionId: uuid("project_version_id")
    .notNull()
    .references(() => projectVersionsTable.id),
  secrets: jsonb("secrets").notNull().$type<Record<string, string>>(),
  isEncrypted: boolean("is_encrypted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userAiApiKeysTable = pgTable(
  "user_ai_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    provider: aiProviderEnum("provider").notNull(),
    apiKey: text("api_key").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("user_ai_api_keys_user_id_idx").on(table.userId),
    uniqueUserProvider: unique("user_ai_api_keys_user_provider_unique").on(
      table.userId,
      table.provider,
    ),
  }),
);

export type InsertUser = typeof usersTable.$inferInsert;
export type SelectUser = typeof usersTable.$inferSelect;
export type InsertProject = typeof projectsTable.$inferInsert;
export type SelectProject = typeof projectsTable.$inferSelect;
export type Project = SelectProject;
export type InsertProjectVersion = typeof projectVersionsTable.$inferInsert;
export type SelectProjectVersion = typeof projectVersionsTable.$inferSelect;
export type ProjectVersion = SelectProjectVersion;
export type InsertProjectSecret = typeof projectSecretsTable.$inferInsert;
export type SelectProjectSecret = typeof projectSecretsTable.$inferSelect;
export type ProjectSecret = SelectProjectSecret;
export type InsertUserAiApiKey = typeof userAiApiKeysTable.$inferInsert;
export type SelectUserAiApiKey = typeof userAiApiKeysTable.$inferSelect;
export type UserAiApiKey = SelectUserAiApiKey;
