# Sync attachments

Status: ready

## Intent

Make card images travel between devices.
Card envelopes already name the images they link in header `refs.attachment_ids`, but no image bytes move.
A card with an image therefore shows its alt text on every device but the one that inserted the image.
`crates/koloda-sync-proto/PROTOCOL.md` §Attachments describes the way; this task builds it on the server, in
`koloda`, and in the engine.

Done when:

- an image inserted on one device shows on another device after both sync, with the same bytes and the same id;
- that holds for images in cards written before enrollment, in cards a joiner bootstraps, and in cards added
  through Add;
- two devices that add the same image leave one stored copy on the server;
- a device that pulls a card before its image is uploaded fetches the image later, without user action;
- the server collects an image no card has linked for 90 days, and a device that links it again uploads it again;
- `bun run check:push` is green and runs the new tests.

## Scope

In:

- `koloda-sync-proto`: the attachment bodies, the shared size cap, and `missing_attachments` on push outcomes.
- `koloda-server`:
  - storing and serving attachment bytes, checked against their id;
  - `attachment_refs`, kept from card heads;
  - `missing_attachments` on push outcomes;
  - collecting attachments no card has linked for 90 days.
- `koloda`:
  - a transfer queue, filled by push outcomes and remote apply;
  - storing fetched bytes through the existing attachment byte store;
  - a migration for the queue.
- `koloda-sync`: uploads and fetches in the cycle, retries, tick budgets, status counts, and an event for the host.
- `PROTOCOL.md`, READMEs, `agents/RUST.md`, and `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`, each with the item
  that makes them true.

Out:

- Device download policy (unmetered only, on demand when a card shows) and metered-network pauses.
  They land with the metered-network work; until then a device fetches every image it lacks.
- Quotas: attachment bytes count toward the space quota once quotas exist.
- Backup and restore of attachment bytes, and the heal re-push that reports them missing (server restore task).
- Tombstone GC, stale devices, and the rest of recovery (recovery task).
- E2EE wire ids.
- NAPI commands, settings screens, and a product spec for sync (the desktop UI task, which lands last).
  `docs/specs/MEDIA.md` does not change: nothing user-visible happens until that task.
- Rebuilding refs or queues for spaces and files that synced before this lands.
  The project is pre-release (`agents/BACKWARDS-COMPATIBILITY.md`).
- The web host, which does not sync, and mobile.

## Open questions

- [x] 1. Area guides?
  Answer: `agents/TASKS.md`, `agents/IMPLEMENTATION-PLAN.md`, `agents/MARKDOWN.md`,
  `agents/CODE-DOCUMENTATION.md`, `agents/CODE-STYLE.md`, `agents/TESTING.md`, `agents/RUST.md`, `agents/DB.md`,
  and `agents/REVIEW.md` for self-review.
  Also `crates/koloda/README.md`, `crates/koloda-sync/README.md`, `crates/koloda-server/README.md`,
  `crates/koloda-sync-proto/PROTOCOL.md` and its README, `docs/decisions/MEDIA-STORAGE.md`,
  `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`, and `docs/specs/MEDIA.md`.
- [x] 2. One task, or the server work apart?
  Answer: one task, server items first.
  The engine cannot be tested without the server's half, and the earlier slices already settled the server's shape.
- [x] 3. What do the transfer requests look like?
  `PROTOCOL.md` describes raw bytes with `HEAD`, `Content-Range` resumable uploads, and `Range` downloads.
  Answer: whole-body CBOR, like every other endpoint.
  - `PUT /v1/spaces/{space}/attachments/{id}` sends `mime`, `width`, `height`, and `bytes`, and returns an empty
    `ok`.
  - `GET` of the same path returns the same four fields, or `404 not_found` when no device has uploaded them.
  - No `HEAD`, no ranges.
  An image is at most 5 MiB, well inside the 16 MiB body cap.
  Replies keep `meta`, so transfers update the skew estimate and fail with the usual error codes.
  The `Transport` trait only gains `PUT`.
  Resumable transfers come back if audio or video arrive, which `docs/decisions/MEDIA-STORAGE.md` anticipates.
  The item that implements this amends §Attachments, §Endpoints, and §Bodies.
- [x] 4. What fills the upload queue?
  `PROTOCOL.md` names two sources: ids the device's own captures linked, and `missing_attachments` from push
  outcomes.
  Answer: `missing_attachments` only.
  Every captured card envelope is pushed and comes back with an outcome.
  That outcome names exactly the ids the server lacks.
  It also covers backfill, Add, and a later heal re-push, with no hook in capture.
  The cost: bytes go up right after the push that reported them, not before it.
  A device that pulls in that gap gets `404` once and fetches again after its backoff.
  The item that implements this amends §Upload.
- [x] 5. Where does the server keep the bytes?
  Answer: files at `generations/<id>/attachments/<space>/<attachment id>`, as the accepted proposal's
  §Server deployment says.
  Metadata (mime, size, width, height, when it was stored, when its last ref went) goes in a new table in the
  space database.
  The space database stays small, and an S3-compatible store can replace the files later.
  A file is written to a temporary name, synced, and renamed into place under the space writer lock, together with
  its metadata row.
  Collection deletes both under the same lock.
- [x] 6. When does a fetch that got `404` try again?
  Answer: after 1 minute, doubling up to 6 hours, and on no other signal.
  An image whose only holder never uploads it stays queued and costs one small request per period.
- [x] 7. How does collection run?
  Answer:
  - an attachment no live card links records when its last ref went;
  - a collection pass removes attachments unlinked for more than 90 days, with their files;
  - `Server::collect_garbage` runs one pass, so tests call it directly, and `serve` runs one every hour;
  - tombstone GC joins the same pass in the recovery task.

## Plan

- [x] 1. Store and serve attachment bytes on the server
  Goal:
  - `koloda-sync-proto` `transport.rs` gains:
    - `MAX_ATTACHMENT_BYTES` (5 MiB, equal to `koloda`'s `ATTACHMENT_MAX_BYTES`);
    - `AttachmentBody` with `mime`, optional `width` and `height`, and `bytes`, used by both `PUT` and `GET`.
  - `koloda-server` serves `PUT` and `GET` on `/v1/spaces/{space}/attachments/{id}` with a device token.
  - `PUT` checks, in order:
    - the id is 64 lowercase hex characters;
    - the body decodes and `bytes` is at most `MAX_ATTACHMENT_BYTES`;
    - `mime` is one of the five accepted image types, and `width` and `height` are positive when present;
    - SHA-256 of `bytes` equals the id.
    A failed check is `400 bad_request`, or `413 too_large` for the size.
    The server never sniffs the bytes, so ciphertext can replace them later.
  - Storing writes `generations/<id>/attachments/<space>/<attachment id>` through a temporary file, syncs it, then
    renames it into place and inserts the metadata row under the space writer lock.
    A second `PUT` of a stored id answers `ok` and writes nothing.
  - `GET` reads the row and the file, or answers `404 not_found`.
  - Space migration `V2__attachments.sql` adds the metadata table.
  - `PROTOCOL.md` §Attachments, §Endpoints, and §Bodies describe the requests (question 3).
  - The server README gains the data directory row and `src/attachments.rs` in its map.
  Constraints:
  - the space writer lock covers the rename and the row together;
  - no attachment code in `log.rs`, `push.rs`, or `pull.rs` in this item.
  Done when: tests in `crates/koloda-server/tests/server/` cover:
  - a `PUT` then a `GET` returning the same bytes and metadata;
  - a second `PUT` of the same id, and two devices of one space putting the same image: one file, one row;
  - a hash mismatch, a malformed id, an unknown mime, and a body one byte past the cap, each refused, with nothing
    stored;
  - exactly `MAX_ATTACHMENT_BYTES` accepted;
  - a `GET` of an id never uploaded: `404 not_found`;
  - another space's token: `404 unknown_space`; a revoked device: `401 revoked`;
  - `bun run check:push` green.
  Commit: Store and serve attachment bytes on the server
  Depends on: none

- [ ] 2. Track card refs to attachments and report missing bytes
  Goal:
  - `koloda-server` keeps `attachment_refs`: which attachment ids each live card links through its current content.
    That is the `cards.content` head, or the `create` while the card has none.
    - Installing a card's `create` or `content` head replaces the card's refs with the header's
      `refs.attachment_ids`.
    - Removing a card, alone or under a deck or template delete, removes its refs.
    - Each stored attachment records when its last ref went, and clears it when a ref returns.
      An attachment stored with no ref records the time it was stored.
  - `PushOutcome` gains `missing_attachments`, omitted when empty.
    Every outcome for a `cards.create` or `cards.content` envelope carries the ids its header links that the server
    holds no bytes for, `stale` and replays included.
    It is computed when the reply is built, never stored in the receipt, so a replay after an upload reports less.
  - `V2__attachments.sql` gains `attachment_refs`.
  - `PROTOCOL.md` §Push outcomes and §Attachments say where `missing_attachments` lives and when it is computed.
  Constraints: refs come from envelope headers only; the server never decodes a payload.
  Done when: tests cover:
  - a card create linking two images, one stored: the outcome names the other;
  - the same push replayed after that upload: the outcome names nothing;
  - a `stale` content envelope still naming its missing ids;
  - an outcome for a deck or a review never carrying the field;
  - a content edit that drops an image: the image's last-ref time is set, and a later edit that links it again
    clears it;
  - a deck delete cascading to a card: the card's images lose their refs;
  - `bun run check:push` green.
  Commit: Track card refs to attachments and report missing bytes
  Depends on: 1

- [ ] 3. Collect attachments no card has linked for 90 days
  Goal:
  - `Server::collect_garbage` runs one collection pass.
    It removes every attachment whose last ref went more than 90 days ago, with its file, under the space writer
    lock.
  - `serve` runs a pass every hour.
  - `PROTOCOL.md` §Attachments states the pass; the server README names it.
  Constraints: tests move the manual clock; no sleeps, and `serve`'s timer is not under test.
  Done when: tests cover:
  - an attachment unlinked for 89 days kept, and one unlinked for 91 days collected, file included;
  - an attachment a live card links kept at any age;
  - an attachment unlinked, linked again, then unlinked again: its 90 days start from the last unlink;
  - after a collection, a push that links the image again reports it in `missing_attachments`, and a new `PUT`
    stores it;
  - `bun run check:push` green.
  Commit: Collect attachments no card has linked for 90 days
  Depends on: 2

- [ ] 4. Queue attachment uploads and fetches on the device
  Goal:
  - `koloda` migration `V10__sync_attachments.sql` adds `sync_attachment_queue`.
    It is keyed by `(id, direction)`, with `direction` `upload` or `fetch`, an attempt count, and the time of the
    next attempt.
  - Remote apply enqueues a fetch for every id in `refs.attachment_ids` of a card `create` it inserts, or a card
    `content` it applies, that has no local `attachments` row.
    Snapshot apply does the same, since it runs the same rule.
  - `settle_push` enqueues an upload for every `missing_attachments` id that has a local `attachments` row, in the
    transaction that settles the outcome.
    An id without one is skipped (question 4).
  - New functions in `repo/sync/attachments.rs`:
    - `due_transfers(db, now, limit)` lists queue rows whose next attempt is due;
    - `upload_source(db, id)` returns the metadata and bytes to send, or drops the row when the attachment is gone;
    - `finish_upload(db, id)` drops the row;
    - `store_fetched(db, id, body)` checks that SHA-256 of the bytes equals the id and validates them like an add.
      It then inserts the row and bytes through the shared insert and drops the queue row, in one transaction.
      Bytes that fail either check drop the row and return an error.
    - `defer_fetch(db, id, now)` schedules the next attempt, 1 minute doubling up to 6 hours (question 6).
    - A due fetch whose id now has a local row, or that no local card links any more, is dropped instead of listed.
  - `add_attachment` and `store_fetched` share one insert helper.
    Bytes still go through `repo::attachment_bytes` only (`docs/decisions/MEDIA-STORAGE.md`).
  - `begin_import` clears the queue with the other `sync_*` tables.
  - `crates/koloda/README.md`, `agents/RUST.md`, and `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` name the queue.
  Constraints:
  - the queue pins nothing: the startup sweep is unchanged;
  - every SQL statement stays in `koloda`;
  - the schema inventory follows the migration (`agents/DB.md`).
  Done when: tests in `crates/koloda/tests/integration/` cover:
  - a pulled card create and a pulled content edit each enqueuing fetches for the ids the device lacks only;
  - a losing content envelope enqueuing nothing;
  - an outcome naming a local and a swept id: one upload queued;
  - `store_fetched` with matching bytes inserting the attachment, and with wrong bytes inserting nothing;
  - backoff at its first step, its doubling, and its cap;
  - a due fetch dropped once the card that linked the id is deleted;
  - `bun run check:push` green.
  Commit: Queue attachment uploads and fetches on the device
  Depends on: 2

- [ ] 5. Transfer attachments in the sync cycle
  Goal:
  - `Transport` gains `PUT`; `HttpTransport` sends it.
  - After its rounds, a cycle uploads and fetches due transfers one at a time.
    - It also runs them when the rounds stopped for clock skew or a file that is behind, since transfers carry no
      stamps.
    - It does not run them while detached, import pending, or not enrolled.
    - It stops early when a trigger arrives, so row sync goes first, and at 64 MiB of transfer bodies per cycle.
    - When due transfers remain, the runner starts the next cycle at once instead of waiting for the poll.
  - Outcomes:
    - an upload `ok` finishes the row;
    - a fetch `ok` goes to `store_fetched`;
    - a fetch `404 not_found` defers the row;
    - a transport failure leaves the row for the next cycle;
    - any other refusal, and bytes `store_fetched` rejects, drop the row and emit `Error`.
  - A tick's byte budget covers transfer bodies sent and received; `Budget::page_bytes` becomes `body_bytes`.
  - `status()` gains the pending upload and fetch counts.
  - `Event::AttachmentsFetched { ids }` tells the host which images arrived, so it can show them.
  - `PROTOCOL.md` §Cycle says where transfers run; the engine README names `src/attachments.rs`.
  Constraints:
  - tests use the in-process server and the paused clock; no sleeps;
  - fetch policy is not an input yet: every due fetch runs.
  Done when: tests in `crates/koloda-sync/tests/engine/` cover:
  - A adding a card with an image, B syncing: B holds the same bytes and gets `AttachmentsFetched`;
  - a card written before enrollment: its image reaches the server through backfill and a joiner fetches it;
  - a joiner bootstrapping a space with images, and a used file joining through Add;
  - A and B adding the same image: the server stores one copy, and neither fetches it;
  - B pulling the card before A uploads: `404`, then the image after the backoff;
  - an image swept on A before its upload: dropped from the queue, nothing sent;
  - a trigger during transfers ending them, and the next cycle finishing them;
  - a tick with a small byte budget stopping between transfers;
  - `bun run check:push` green.
  Commit: Transfer attachments in the sync cycle
  Depends on: 1, 4

## Outcome

