ALTER TABLE sync_state ADD COLUMN cursor_hot integer NOT NULL DEFAULT 0;

ALTER TABLE sync_state ADD COLUMN cursor_cold integer NOT NULL DEFAULT 0;
