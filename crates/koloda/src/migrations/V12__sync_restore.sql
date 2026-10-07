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

-- WHY: an authoritative restore discards local data only once the host accepts it. Until then the file records the
-- restore's epoch and the server's last consumed seq for this device, and sends nothing; the record survives a
-- relaunch (crates/koloda-sync-proto/PROTOCOL.md, Server restore).
ALTER TABLE sync_state ADD COLUMN authoritative_epoch blob;

ALTER TABLE sync_state ADD COLUMN authoritative_last_seq integer;

-- WHY: a backup can hold a card whose image was uploaded after the backup was taken. No device re-pushes that card,
-- so no push reports the bytes missing; after a restore the device asks the server once which linked images it lacks
-- (crates/koloda-sync-proto/PROTOCOL.md, Server restore).
ALTER TABLE sync_state ADD COLUMN is_checking_attachments integer NOT NULL DEFAULT 0;
