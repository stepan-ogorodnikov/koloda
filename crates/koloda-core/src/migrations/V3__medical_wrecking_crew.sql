CREATE TABLE IF NOT EXISTS conversations (
	id text PRIMARY KEY NOT NULL,
	state text NOT NULL,
	updated_at integer,
	created_at integer NOT NULL
);
