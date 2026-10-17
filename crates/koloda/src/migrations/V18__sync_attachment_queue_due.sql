-- WHY: the engine asks for 16 due transfers at a time, and each call reads the due queue in this order. Without the
-- index each call scans and sorts the whole queue, so draining a large backlog costs its size squared
-- (crates/koloda-sync-proto/PROTOCOL.md, Attachments).
CREATE INDEX IF NOT EXISTS sync_attachment_queue_due_idx ON sync_attachment_queue (next_attempt_at, direction, id);
