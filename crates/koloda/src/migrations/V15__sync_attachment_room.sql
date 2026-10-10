-- WHY: an upload waits for the space to have room (`507`), or for a server that failed on it to recover. Only the
-- first goes at once when the device record shows room again; the second keeps its backoff, so a blob the server
-- cannot take is not sent again every cycle (crates/koloda-sync-proto/PROTOCOL.md, Upload).
ALTER TABLE sync_attachment_queue ADD COLUMN is_waiting_for_room integer NOT NULL DEFAULT 0;

UPDATE sync_attachment_queue SET is_waiting_for_room = 1 WHERE direction = 'upload' AND attempts > 0;
