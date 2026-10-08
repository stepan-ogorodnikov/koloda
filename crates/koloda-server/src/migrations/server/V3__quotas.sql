-- WHY: a space over its quota holds growing writes; NULL means the space has none (crates/koloda-sync-proto/PROTOCOL.md,
-- Quotas).
ALTER TABLE spaces ADD COLUMN quota_bytes integer;
