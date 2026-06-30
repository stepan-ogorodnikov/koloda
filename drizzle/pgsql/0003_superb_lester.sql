ALTER TABLE "conversations" ADD COLUMN "title" varchar(255);--> statement-breakpoint
CREATE INDEX "conversations_updated_at_idx" ON "conversations" USING btree ("updated_at","created_at");