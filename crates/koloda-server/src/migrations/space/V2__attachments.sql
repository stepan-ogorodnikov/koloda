-- Attachments stored for the space (crates/koloda-sync-proto/PROTOCOL.md, Attachments). The bytes live in
-- attachments/<space>/<id> under the generation; a row exists only once its file is in place.
CREATE TABLE IF NOT EXISTS attachments (
    id text PRIMARY KEY,
    mime text NOT NULL,
    size integer NOT NULL,
    width integer,
    height integer,
    stored_at integer NOT NULL
);
