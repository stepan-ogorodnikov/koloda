ALTER TABLE `conversations` ADD `title` text;--> statement-breakpoint
CREATE INDEX `conversations_updated_at_idx` ON `conversations` (`updated_at`,`created_at`);