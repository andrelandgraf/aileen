ALTER TABLE "project_secrets" ALTER COLUMN "secrets" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "project_secrets" DROP COLUMN "is_encrypted";