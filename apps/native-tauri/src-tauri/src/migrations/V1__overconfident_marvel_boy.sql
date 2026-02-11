CREATE TABLE IF NOT EXISTS algorithms (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	title text NOT NULL,
	content text NOT NULL,
	updated_at integer,
	created_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS algorithms_title_idx ON algorithms (title);
CREATE TABLE IF NOT EXISTS cards (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	deck_id integer NOT NULL,
	template_id integer NOT NULL,
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
	FOREIGN KEY (deck_id) REFERENCES decks(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (template_id) REFERENCES templates(id) ON UPDATE no action ON DELETE no action
);
CREATE INDEX IF NOT EXISTS cards_due_at_idx ON cards (due_at);
CREATE TABLE IF NOT EXISTS decks (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	title text NOT NULL,
	algorithm_id integer NOT NULL,
	template_id integer NOT NULL,
	updated_at integer,
	created_at integer NOT NULL,
	FOREIGN KEY (algorithm_id) REFERENCES algorithms(id) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (template_id) REFERENCES templates(id) ON UPDATE no action ON DELETE no action
);
CREATE INDEX IF NOT EXISTS decks_title_idx ON decks (title);
CREATE TABLE IF NOT EXISTS reviews (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	card_id integer NOT NULL,
	state integer DEFAULT 0 NOT NULL,
	rating integer DEFAULT 0 NOT NULL,
	due_at integer,
	stability real DEFAULT 0 NOT NULL,
	difficulty real DEFAULT 0 NOT NULL,
	scheduled_days integer DEFAULT 0 NOT NULL,
	learning_steps integer DEFAULT 0 NOT NULL,
	is_ignored integer DEFAULT false NOT NULL,
	created_at integer NOT NULL,
	FOREIGN KEY (card_id) REFERENCES cards(id) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE IF NOT EXISTS settings (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	name text NOT NULL,
	content text DEFAULT '{}' NOT NULL,
	updated_at integer,
	created_at integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS settings_name_idx ON settings (name);
CREATE TABLE IF NOT EXISTS templates (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	title text NOT NULL,
	content text NOT NULL,
	updated_at integer,
	created_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS templates_title_idx ON templates (title);