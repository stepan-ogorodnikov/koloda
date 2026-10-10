-- WHY: a cohort's rows are found by commit id when a newer write replaces a pending one, a push is refused, a fixed
-- cohort returns to local, and heal moves a cohort to the tail. The outbox drains, so the index stays small
-- (crates/koloda-sync-proto/PROTOCOL.md, Cohorts).
CREATE INDEX IF NOT EXISTS sync_outbox_commit_id_idx ON sync_outbox (commit_id);
