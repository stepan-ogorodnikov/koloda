CREATE TABLE "conversations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
