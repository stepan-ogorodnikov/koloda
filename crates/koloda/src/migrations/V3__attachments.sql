CREATE TABLE IF NOT EXISTS attachments (
	id text PRIMARY KEY NOT NULL,
	mime text NOT NULL,
	size integer NOT NULL,
	width integer,
	height integer,
	created_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS attachment_bytes (
	id text PRIMARY KEY NOT NULL,
	bytes blob NOT NULL,
	FOREIGN KEY (id) REFERENCES attachments(id) ON UPDATE NO ACTION ON DELETE CASCADE
);
