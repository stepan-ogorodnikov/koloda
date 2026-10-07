-- WHY: a device unseen for the stale window must re-bootstrap before the server takes its pushes again; releasing a
-- snapshot lease clears the flag (crates/koloda-sync-proto/PROTOCOL.md, Devices).
ALTER TABLE devices ADD COLUMN rebase_required integer NOT NULL DEFAULT 0;
