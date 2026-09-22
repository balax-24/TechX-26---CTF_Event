CREATE TABLE IF NOT EXISTS "challenge_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'CREATING' NOT NULL,
	"container_id" varchar(64),
	"container_name" varchar(128) NOT NULL,
	"internal_ip" varchar(45),
	"internal_port" integer NOT NULL,
	"access_token" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"stopped_at" timestamp with time zone,
	"failure_reason" text,
	"instance_metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_challenge_instances_team_chal_active" ON "challenge_instances" USING btree ("team_id", "challenge_id") WHERE status IN ('CREATING', 'RUNNING', 'STOPPING');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_challenge_instances_team_id" ON "challenge_instances" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_challenge_instances_container_id" ON "challenge_instances" USING btree ("container_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_challenge_instances_expires_status" ON "challenge_instances" USING btree ("expires_at", "status");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "challenge_instances" ADD CONSTRAINT "challenge_instances_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "challenge_instances" ADD CONSTRAINT "challenge_instances_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "challenge_instances" ADD CONSTRAINT "challenge_instances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
