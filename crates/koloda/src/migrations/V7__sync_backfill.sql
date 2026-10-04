-- WHY: enrollment reserves one stamp per backfill phase, below every later capture, and the scan resumes from
-- its watermark; a NULL step means backfill has finished (crates/koloda-sync-proto/PROTOCOL.md, Existing rows
-- at enable time).
ALTER TABLE sync_state ADD COLUMN role text NOT NULL DEFAULT 'joiner';

ALTER TABLE sync_state ADD COLUMN backfill_create_hlc integer NOT NULL DEFAULT 0;

ALTER TABLE sync_state ADD COLUMN backfill_review_hlc integer NOT NULL DEFAULT 0;

ALTER TABLE sync_state ADD COLUMN backfill_scheduling_hlc integer NOT NULL DEFAULT 0;

ALTER TABLE sync_state ADD COLUMN backfill_step text;

ALTER TABLE sync_state ADD COLUMN backfill_after_ts integer;

ALTER TABLE sync_state ADD COLUMN backfill_after_id text;
