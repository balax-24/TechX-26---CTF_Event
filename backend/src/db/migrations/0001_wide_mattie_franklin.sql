CREATE TABLE IF NOT EXISTS "score_event_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(64) NOT NULL,
	"event_type" varchar(30) NOT NULL,
	"team_id" uuid NOT NULL,
	"challenge_id" uuid,
	"points" integer NOT NULL,
	"team_score" integer NOT NULL,
	"rank" integer,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "score_event_outbox_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "score_event_outbox" ADD CONSTRAINT "score_event_outbox_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "score_event_outbox" ADD CONSTRAINT "score_event_outbox_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_score_event_outbox_pub_created" ON "score_event_outbox" USING btree ("published_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_score_event_outbox_event_id" ON "score_event_outbox" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_score_event_outbox_team_id" ON "score_event_outbox" USING btree ("team_id");