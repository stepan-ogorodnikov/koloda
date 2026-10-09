-- WHY: a space with a quota checks its usage on every device call, push, bootstrap, and upload, and summing every
-- attachment's size each time scans the table (crates/koloda-sync-proto/PROTOCOL.md, Quotas). The triggers move the
-- total with every insert and delete, whichever writer makes it, and `VACUUM INTO` copies them into a backup.
-- An attachment's size never changes: its id is the hash of its bytes.
ALTER TABLE space ADD COLUMN attachment_bytes integer NOT NULL DEFAULT 0;

UPDATE space SET attachment_bytes = (SELECT coalesce(sum(size), 0) FROM attachments);

CREATE TRIGGER IF NOT EXISTS attachments_insert_bytes AFTER INSERT ON attachments
BEGIN
    UPDATE space SET attachment_bytes = attachment_bytes + NEW.size;
END;

CREATE TRIGGER IF NOT EXISTS attachments_delete_bytes AFTER DELETE ON attachments
BEGIN
    UPDATE space SET attachment_bytes = attachment_bytes - OLD.size;
END;
