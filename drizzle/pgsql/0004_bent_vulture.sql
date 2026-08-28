CREATE INDEX "cards_deck_id_idx" ON "cards" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "cards_template_id_idx" ON "cards" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "decks_algorithm_id_idx" ON "decks" USING btree ("algorithm_id");--> statement-breakpoint
CREATE INDEX "decks_template_id_idx" ON "decks" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "reviews_card_id_idx" ON "reviews" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "reviews_created_at_idx" ON "reviews" USING btree ("created_at");