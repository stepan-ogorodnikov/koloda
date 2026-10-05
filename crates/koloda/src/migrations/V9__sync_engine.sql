-- WHY: the engine calls the server the file enrolled with, and stores the space's epoch so a later restore shows as a
-- different one (crates/koloda-sync-proto/PROTOCOL.md, Client state).
ALTER TABLE sync_state ADD COLUMN server_url text;

ALTER TABLE sync_state ADD COLUMN epoch blob;
