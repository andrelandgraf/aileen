ALTER TABLE "projects" DROP CONSTRAINT "projects_current_dev_version_id_project_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "project_versions" ALTER COLUMN "assistant_message_id" DROP NOT NULL;