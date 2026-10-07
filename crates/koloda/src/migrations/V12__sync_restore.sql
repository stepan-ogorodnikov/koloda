-- WHY: after a heal restore, every write whose (sender, sender_seq) is above that sender's cutoff is re-pushed. A sender
-- with no row here counts as cutoff 0. The scan resumes from its step and the last id it enqueued; a NULL step means
-- no heal is running (crates/koloda-sync-proto/PROTOCOL.md, Server restore).
CREATE TABLE IF NOT EXISTS sync_heal_cutoffs (
	sender blob PRIMARY KEY NOT NULL,
	last_seq integer NOT NULL
);

ALTER TABLE sync_state ADD COLUMN heal_step text;

ALTER TABLE sync_state ADD COLUMN heal_after_id text;

-- WHY: a card's delete envelope names its deck, and heal re-encodes a tombstone after the card row is gone.
ALTER TABLE sync_tombstones ADD COLUMN parent text;
