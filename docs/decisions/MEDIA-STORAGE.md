# Media Storage

## Ruling

- Card media is stored as attachment rows in the app's SQLite database on both hosts.
- An attachment's id is the lowercase hex SHA-256 of its bytes.
  The repo computes it; callers never supply an id.
  Adding the same bytes again keeps the existing row's metadata and bytes.
  Only its creation time moves forward, never back, so cleanup's grace counts from the latest add.
- Card content refers to an attachment as markdown: `![alt](attachment:<id>)`.
  Card content stays a plain markdown string per field.
  Nothing outside the text marks a card as having media.
- Metadata (mime, size, width, height, creation time) lives in `attachments`.
  Width and height are optional: they are set when the editor decoded the image, and null otherwise.
  An image embedded from a link has none.
  Bytes live in `attachment_bytes`, keyed by the same id.
- One byte-store module per host is the only code that reads or writes `attachment_bytes`:
  `libs/db-sqlite/src/lib/attachment-bytes.ts` and `crates/koloda/src/repo/attachment_bytes.rs`.
  Deleting an attachment row removes its bytes through the foreign-key cascade.
  A file-backed store replaces that module and takes over deletion; metadata and refs never move.
- Both repos validate every add: the format comes from magic bytes, and the size cap applies.
  The editor runs the same checks first, only for fast feedback.
  The editor also decodes the image and refuses one that does not decode.
  That check is the editor's alone, so an image stored another way, such as from a link, may not decode.
- Card content is the only thing that keeps an attachment alive.
  Nothing else, such as conversation state, holds an attachment.

## Why

Data URLs bloat every card read and make the text unusable to edit.
Remote URLs break offline review, leave caching to the network, and leak each review to another site.
A content hash gives deduplication and stable cache keys without bookkeeping, and refs survive any move of the bytes.
Keeping bytes in the database keeps them atomic with card writes and inside one backup.
Splitting metadata from bytes lets large media (audio, video) pick another store by size later
without a content migration.

## Applies when

- Storing, reading, validating, or deleting attachment bytes or metadata on either host.
- Adding a media type, a byte store, or anything else that could keep an attachment alive.
- Changing how card content refers to media.
