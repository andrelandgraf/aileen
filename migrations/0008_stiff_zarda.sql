CREATE TYPE "public"."ai_provider" AS ENUM('anthropic', 'openai', 'openrouter');--> statement-breakpoint
CREATE TABLE "user_ai_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"api_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_ai_api_keys_user_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "user_ai_api_keys" ADD CONSTRAINT "user_ai_api_keys_user_id_users_sync_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."users_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_ai_api_keys_user_id_idx" ON "user_ai_api_keys" USING btree ("user_id");