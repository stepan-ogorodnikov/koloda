-- WHY: a file detached because a restore predates its device, or rotated every token, asks for a new pairing rather
-- than reporting a revocation, and must still ask after a relaunch (crates/koloda-sync-proto/PROTOCOL.md, Devices).
-- Files detached before this column read as revoked, as they showed before.
ALTER TABLE sync_state ADD COLUMN detach_reason text;

UPDATE sync_state SET detach_reason = 'revoked' WHERE detached_at IS NOT NULL;
