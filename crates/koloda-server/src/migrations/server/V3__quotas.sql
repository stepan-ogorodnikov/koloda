-- WHY: a space over its quota holds growing writes; NULL means the space has none (crates/koloda-sync-proto/PROTOCOL.md,
-- Quotas).
ALTER TABLE spaces ADD COLUMN quota_bytes integer;

-- WHY: the `koloda-schemas` header as the device last sent it; NULL means it never advertised. `write-schema` raises a
-- kind only when every active device lists it (crates/koloda-sync-proto/PROTOCOL.md, Schema versions).
ALTER TABLE devices ADD COLUMN schemas text;
