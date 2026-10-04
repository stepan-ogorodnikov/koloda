-- WHY: a joining file records the space it claimed and waits in `import_pending` until Add or Replace makes it
-- `active`; nothing is captured, backfilled, or applied meanwhile (crates/koloda-sync-proto/PROTOCOL.md, Joining).
ALTER TABLE sync_state ADD COLUMN space_id blob;

ALTER TABLE sync_state ADD COLUMN join_phase text NOT NULL DEFAULT 'active';
