-- WHY: a claim or a space creation can commit on the server while its reply is lost, or just before the app stops.
-- The file keeps the nonce until it records the enrollment, so the next attempt, after a relaunch too, gets the same
-- device. The token waits in the secret store under sync.pending_token.{nonce}, written before this row. A creation
-- leaves code_hash, space_id, and server_url NULL (crates/koloda-sync-proto/PROTOCOL.md, Pairing).
CREATE TABLE IF NOT EXISTS sync_enrolling (
	id integer PRIMARY KEY NOT NULL CHECK (id = 1),
	kind text NOT NULL,
	nonce blob NOT NULL,
	code_hash blob,
	space_id blob,
	server_url text
);
