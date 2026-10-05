-- WHY: the engine calls the server the file enrolled with, and stores the space's epoch so a later restore shows as a
-- different one (crates/koloda-sync-proto/PROTOCOL.md, Client state).
ALTER TABLE sync_state ADD COLUMN server_url text;

ALTER TABLE sync_state ADD COLUMN epoch blob;

-- WHY: a `held` outcome consumed its seq, but the write still has to land. The bytes keep its stamp and commit id for
-- when the reason clears (crates/koloda-sync-proto/PROTOCOL.md, Push outcomes).
CREATE TABLE IF NOT EXISTS sync_held (
	sender_seq integer PRIMARY KEY NOT NULL,
	kind text NOT NULL,
	id text NOT NULL,
	group_name text,
	commit_id blob NOT NULL,
	envelope blob NOT NULL,
	reason text NOT NULL
);

-- WHY: the highest seq of this device that a push reply showed consumed. A higher `last_sender_seq` on the device
-- record with no row of this file in flight for the seqs between means another copy of the file pushed them
-- (crates/koloda-sync-proto/PROTOCOL.md, Devices).
ALTER TABLE sync_state ADD COLUMN last_observed_server_seq integer NOT NULL DEFAULT 0;
