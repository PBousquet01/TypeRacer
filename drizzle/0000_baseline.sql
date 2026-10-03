CREATE TABLE "identities" (
	"provider" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identities_pkey" PRIMARY KEY("provider","provider_id"),
	CONSTRAINT "identities_user_id_provider_key" UNIQUE("user_id","provider"),
	CONSTRAINT "identities_provider_check" CHECK ("identities"."provider" IN ('github', 'discord'))
);
--> statement-breakpoint
CREATE TABLE "passages" (
	"id" serial PRIMARY KEY NOT NULL,
	"language" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passages_language_check" CHECK ("passages"."language" IN ('en', 'fr'))
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"room_code" text NOT NULL,
	"wpm" integer NOT NULL,
	"accuracy" integer,
	"time_ms" integer,
	"place" integer,
	"riders" integer NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"score" integer
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unlocks" (
	"user_id" integer NOT NULL,
	"mount" text NOT NULL,
	CONSTRAINT "unlocks_pkey" PRIMARY KEY("user_id","mount")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "words" (
	"language" text NOT NULL,
	"word" text NOT NULL,
	CONSTRAINT "words_pkey" PRIMARY KEY("language","word"),
	CONSTRAINT "words_language_check" CHECK ("words"."language" IN ('en', 'fr'))
);
--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlocks" ADD CONSTRAINT "unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passages_by_language" ON "passages" USING btree ("language");--> statement-breakpoint
CREATE INDEX "races_by_user" ON "races" USING btree ("user_id","finished_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "sessions_by_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower" ON "users" USING btree (lower("username"));