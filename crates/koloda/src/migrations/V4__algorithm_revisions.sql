-- WHY: no foreign key to algorithms. Revisions outlive a deleted algorithm, and a NO ACTION key would block the delete.
CREATE TABLE IF NOT EXISTS algorithm_revisions (
	id text PRIMARY KEY NOT NULL,
	algorithm_id text NOT NULL,
	content text NOT NULL,
	actor text NOT NULL,
	created_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS algorithm_revisions_algorithm_id_created_at_idx ON algorithm_revisions(algorithm_id, created_at);
