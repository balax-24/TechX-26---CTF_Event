CREATE TABLE IF NOT EXISTS "competition_state" (
	"id" varchar(50) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"name" varchar(150) DEFAULT 'TechX CTF 2026' NOT NULL,
	"state" varchar(30) DEFAULT 'draft' NOT NULL,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"registration_start_time" timestamp with time zone,
	"registration_end_time" timestamp with time zone,
	"timezone" varchar(50) DEFAULT 'Asia/Kolkata' NOT NULL,
	"is_submission_enabled" boolean DEFAULT true NOT NULL,
	"default_challenge_visibility" varchar(20) DEFAULT 'hidden' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_idempotency_keys" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"action" varchar(100) NOT NULL,
	"actor_id" uuid NOT NULL,
	"response_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'active' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_teams_status" ON "teams" USING btree ("status");
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_role" varchar(20);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "previous_state" jsonb;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "new_state" jsonb;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "reason" text;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "request_id" varchar(64);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_logs_entity" ON "audit_logs" USING btree ("entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_logs_actor" ON "audit_logs" USING btree ("actor_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_idempotency_keys" ADD CONSTRAINT "admin_idempotency_keys_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "competition_state" ("id", "name", "state", "timezone", "is_submission_enabled", "default_challenge_visibility")
VALUES ('default', 'TechX CTF 2026', 'draft', 'Asia/Kolkata', true, 'hidden')
ON CONFLICT ("id") DO NOTHING;
