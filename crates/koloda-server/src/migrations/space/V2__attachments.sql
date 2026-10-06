-- Attachments stored for the space (crates/koloda-sync-proto/PROTOCOL.md, Attachments). The bytes live in
-- attachments/<space>/<id> under the generation; a row exists only once its file is in place.
-- `unlinked_since` is when the last live card stopped linking it, or when it was stored unlinked; NULL while linked.
CREATE TABLE IF NOT EXISTS attachments (
    id text PRIMARY KEY,
    mime text NOT NULL,
    size integer NOT NULL,
    width integer,
    height integer,
    stored_at integer NOT NULL,
    unlinked_since integer
);

-- Which attachments each live card links through its current content: the `cards.content` head, or the `create`
-- while the card has none. Kept from envelope headers; a ref may name an attachment no device has uploaded yet.
CREATE TABLE IF NOT EXISTS attachment_refs (
    card text NOT NULL,
    attachment text NOT NULL,
    PRIMARY KEY (card, attachment)
);

CREATE INDEX IF NOT EXISTS attachment_refs_attachment ON attachment_refs (attachment);
