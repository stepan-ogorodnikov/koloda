CREATE INDEX IF NOT EXISTS cards_deck_id_idx ON cards(deck_id);

CREATE INDEX IF NOT EXISTS cards_template_id_idx ON cards(template_id);

CREATE INDEX IF NOT EXISTS decks_algorithm_id_idx ON decks(algorithm_id);

CREATE INDEX IF NOT EXISTS decks_template_id_idx ON decks(template_id);

CREATE INDEX IF NOT EXISTS reviews_card_id_idx ON reviews(card_id);

CREATE INDEX IF NOT EXISTS reviews_created_at_idx ON reviews(created_at);
