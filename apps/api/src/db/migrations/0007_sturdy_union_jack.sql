CREATE TABLE "user_memories" (
	"owner_id" varchar(255) PRIMARY KEY NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
