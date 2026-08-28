CREATE INDEX `cards_deck_id_idx` ON `cards` (`deck_id`);--> statement-breakpoint
CREATE INDEX `cards_template_id_idx` ON `cards` (`template_id`);--> statement-breakpoint
CREATE INDEX `decks_algorithm_id_idx` ON `decks` (`algorithm_id`);--> statement-breakpoint
CREATE INDEX `decks_template_id_idx` ON `decks` (`template_id`);--> statement-breakpoint
CREATE INDEX `reviews_card_id_idx` ON `reviews` (`card_id`);--> statement-breakpoint
CREATE INDEX `reviews_created_at_idx` ON `reviews` (`created_at`);