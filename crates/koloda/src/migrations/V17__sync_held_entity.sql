-- WHY: a re-bootstrap's absence cleanup keeps every create still held, and looks each one up by kind and id. A quota
-- hold can hold the whole backfill, so a scan per create would cost minutes on a large file
-- (crates/koloda-sync-proto/PROTOCOL.md, Re-bootstrap).
CREATE INDEX IF NOT EXISTS sync_held_kind_id_group_name_idx ON sync_held (kind, id, group_name);
