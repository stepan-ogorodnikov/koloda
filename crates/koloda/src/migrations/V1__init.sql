CREATE TABLE IF NOT EXISTS algorithms (
	id text PRIMARY KEY NOT NULL,
	title text NOT NULL,
	content text NOT NULL,
	updated_at integer,
	created_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS algorithms_title_idx ON algorithms (title);

CREATE TABLE IF NOT EXISTS templates (
	id text PRIMARY KEY NOT NULL,
	title text NOT NULL,
	content text NOT NULL,
	updated_at integer,
	created_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS templates_title_idx ON templates (title);

CREATE TABLE IF NOT EXISTS decks (
	id text PRIMARY KEY NOT NULL,
	title text NOT NULL,
	algorithm_id text NOT NULL,
	template_id text NOT NULL,
	updated_at integer,
	created_at integer NOT NULL,
	FOREIGN KEY (algorithm_id) REFERENCES algorithms(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
	FOREIGN KEY (template_id) REFERENCES templates(id) ON UPDATE NO ACTION ON DELETE NO ACTION
);
CREATE INDEX IF NOT EXISTS decks_title_idx ON decks (title);
CREATE INDEX IF NOT EXISTS decks_algorithm_id_idx ON decks(algorithm_id);
CREATE INDEX IF NOT EXISTS decks_template_id_idx ON decks(template_id);

CREATE TABLE IF NOT EXISTS cards (
	id text PRIMARY KEY NOT NULL,
	deck_id text NOT NULL,
	template_id text NOT NULL,
	content text,
	state integer DEFAULT 0,
	due_at integer,
	stability real DEFAULT 0,
	difficulty real DEFAULT 0,
	scheduled_days integer DEFAULT 0,
	learning_steps integer DEFAULT 0,
	reps integer DEFAULT 0,
	lapses integer DEFAULT 0,
	last_reviewed_at integer,
	updated_at integer,
	created_at integer NOT NULL,
	FOREIGN KEY (deck_id) REFERENCES decks(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
	FOREIGN KEY (template_id) REFERENCES templates(id) ON UPDATE NO ACTION ON DELETE NO ACTION
);
CREATE INDEX IF NOT EXISTS cards_due_at_idx ON cards (due_at);
CREATE INDEX IF NOT EXISTS cards_deck_id_idx ON cards(deck_id);
CREATE INDEX IF NOT EXISTS cards_template_id_idx ON cards(template_id);

CREATE TABLE IF NOT EXISTS reviews (
	id text PRIMARY KEY NOT NULL,
	card_id text NOT NULL,
	state integer DEFAULT 0 NOT NULL,
	rating integer DEFAULT 0 NOT NULL,
	due_at integer,
	stability real DEFAULT 0 NOT NULL,
	difficulty real DEFAULT 0 NOT NULL,
	scheduled_days integer DEFAULT 0 NOT NULL,
	learning_steps integer DEFAULT 0 NOT NULL,
	is_ignored integer DEFAULT 0 NOT NULL,
	created_at integer NOT NULL,
	time integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (card_id) REFERENCES cards(id) ON UPDATE NO ACTION ON DELETE NO ACTION
);
CREATE INDEX IF NOT EXISTS reviews_card_id_idx ON reviews(card_id);
CREATE INDEX IF NOT EXISTS reviews_created_at_idx ON reviews(created_at);

CREATE TABLE IF NOT EXISTS settings (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	name text NOT NULL,
	content text DEFAULT '{}' NOT NULL,
	updated_at integer,
	created_at integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS settings_name_idx ON settings (name);

CREATE TABLE IF NOT EXISTS conversations (
	id text PRIMARY KEY NOT NULL,
	state text NOT NULL,
	title text,
	updated_at integer,
	created_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx ON conversations(updated_at, created_at);
