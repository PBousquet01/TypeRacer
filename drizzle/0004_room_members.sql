CREATE TABLE "room_members" (
	"person" text PRIMARY KEY NOT NULL,
	"room_code" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
