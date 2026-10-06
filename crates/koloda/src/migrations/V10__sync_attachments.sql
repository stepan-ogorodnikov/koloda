-- WHY: images travel outside the envelope log. A device uploads the ids a push outcome reported missing and fetches
-- the ids a remote card links that it lacks; a fetch the server cannot serve yet waits for its next attempt
-- (crates/koloda-sync-proto/PROTOCOL.md, Attachments).
CREATE TABLE IF NOT EXISTS sync_attachment_queue (
	id text NOT NULL,
	direction text NOT NULL,
	attempts integer NOT NULL DEFAULT 0,
	next_attempt_at integer NOT NULL DEFAULT 0,
	PRIMARY KEY (id, direction)
);
