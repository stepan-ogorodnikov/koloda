ALTER TABLE conversations ADD COLUMN title text;

CREATE INDEX IF NOT EXISTS conversations_updated_at_idx ON conversations(updated_at, created_at);
