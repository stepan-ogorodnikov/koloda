-- WHY: a device unseen for the stale window must re-bootstrap before the server takes its pushes again; releasing a
-- snapshot lease clears the flag (crates/koloda-sync-proto/PROTOCOL.md, Devices).
ALTER TABLE devices ADD COLUMN rebase_required integer NOT NULL DEFAULT 0;

-- WHY: a fork is idempotent by nonce, so a file that stopped after the fork reply and before it stored the token forks
-- to the same record when it retries, and leaves no orphan record that pins GC (crates/koloda-sync-proto/PROTOCOL.md,
-- Behind its own record).
ALTER TABLE devices ADD COLUMN fork_nonce blob;

CREATE UNIQUE INDEX IF NOT EXISTS devices_fork_nonce ON devices (forked_from, fork_nonce) WHERE fork_nonce IS NOT NULL;
