CREATE TABLE "race_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_code" text NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bonuses" boolean DEFAULT false NOT NULL,
	"players" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "run_id" integer;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "player_id" text;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."race_runs"("id") ON DELETE set null ON UPDATE no action;