# Card media (images)

Status: ready

## Intent

Users can put images into markdown card fields from the editor: paste image data, drop a file, or pick a file.
In the desktop app, they can also embed an image from a pasted URL; the web demo leaves that out.
Images render in card preview and lessons.
Reviews keep working offline, and behavior matches on web and desktop.
Audio and video come later on the same storage.

Design rulings behind the work:

- The canonical representation is attachment rows in SQLite.
- An attachment's `id` is the lowercase hex SHA-256 of its bytes, computed by the repo.
- Card content references an image as markdown: `![alt](attachment:<id>)`.
- Card content stays a plain `{ text }` markdown string per field, so card Zod/Rust validation is unchanged.
- Deduplication and stable cache keys come from content addressing for free.
- Metadata (mime, size, width, height) lives in `attachments`; bytes live in `attachment_bytes`.
- One byte-store module per backend is the only code that touches `attachment_bytes` (put/get/delete by id).
  A future file store replaces that module; metadata and refs never move.
- Both repos validate every write (format sniff, size cap).
  The editor runs the same check first, only for fast feedback.
- Rendering never reaches the network.
  Images show only for attachment refs and the app's own files.
- Only card content keeps an attachment alive.

Done when: pasting, dropping, or picking an image in a markdown field inserts a working ref on web and desktop.
The image renders in preview and lessons, and survives a reload or relaunch.
Rejected formats and oversized files surface validation errors.
A `data:` image in existing content shows its alt text instead.
On desktop, embedding a pasted image URL stores the image; after that, showing it never touches the network.
Both backend integration suites pass.

## Scope

In:

- `V3__attachments.sql` (next free number) shared by both backends; schema-inventory refresh per `agents/DB.md`.
- Attachment domain twins: Zod and helpers in `libs/srs`, serde in `crates/koloda`.
- Repos on both sides, with the byte-store module as the only reader and writer of `attachment_bytes`.
- `Queries` methods and desktop IPC channels for get, add, and sweep; bytes cross desktop IPC as base64.
- Renderer: attachment refs resolve to object URLs through a ref-counted cache.
- `data:` images stop rendering, like remote images already do.
- CSP: `blob:` added to `img-src` on both hosts.
- Editor: paste, drop, and pick in the add-card and card-details markdown fields.
- Validation: magic-byte sniffing (PNG, JPEG, GIF, WebP, AVIF), SVG rejected, 5 MiB cap, error codes with locales.
- Sweep of unreferenced attachments after startup, with a 24-hour grace window.
- Desktop only: embed an image from a pasted URL, fetched once in the main process.
- Docs: `docs/decisions/MEDIA-STORAGE.md`, `docs/specs/MEDIA.md`, `docs/specs/CARDS.md` updates.
- Docs: the id exception in `agents/DB.md`, `apps/electron/IPC.md`, routing rows in `agents/INDEX.md`.

Out:

- Audio or video support, playback UI, duration metadata.
- Embedding an image from a pasted URL in the web demo.
  A page-origin `fetch()` is blocked by CORS on most hosts (`docs/decisions/APP-ROLES.md`).
- File/OPFS byte store and an Electron protocol handler for serving bytes.
- Transcoding, recompression, thumbnail generation.
- SVG support.
- Export/import/sync of attachments (no such features exist yet).
- Images in the cards table and the assistant review table (both stay raw text).
- Images in assistant messages: a ref there shows its alt text.
- AI/assistant changes (refs flow as plain text through the existing path).
- Keeping an attachment alive from anything but card content, such as conversation state.
- Playwright specs; media flows are covered by the Manual verify blocks.

## Open questions

- [x] Canonical representation — DB attachments referenced as `attachment:<id>`.
  Data URIs rejected: they bloat every card read and make textareas unusable.
  Remote URLs rejected as canonical: offline-hostile, uncontrolled cache, privacy leak per review.
- [x] Filesystem vs DB — DB in v1.
  On web, OPFS shares the origin's quota and has no atomicity with the IndexedDB-backed database, so it buys nothing.
  On desktop, files add orphan management and split backups.
  The byte-store module keeps a file backend open for large media.
- [x] Remote image URLs — never rendered; links stay clickable.
  Already true on main: `markdownToHtml` drops remote image URLs, and both hosts' CSP blocks them.
- [x] `data:` images — stop rendering; they show their alt text like any other non-attachment image.
  This reverses the "embedded in the text" line in `docs/specs/CARDS.md` (§Rendered Markdown).
- [x] Embedding pasted image URLs — desktop only, fetched in the main process, which CORS does not apply to.
  The web demo leaves it out, per `docs/decisions/APP-ROLES.md`; `docs/specs/MEDIA.md` states the difference.
  Never silent: the URL pastes as text, and embedding is an explicit action.
- [x] Formats — sniff magic bytes, never extension or MIME header.
  Accept PNG, JPEG, GIF, WebP, AVIF; store original bytes; no transcoding in v1.
- [x] SVG — rejected.
  An object URL carries the app's origin, so an SVG opened as a page would run script as the app.
- [x] Per-image size cap — 5 MiB (5,242,880 bytes); larger files are rejected with a validation error.
- [x] Sweep trigger — once per app session, after the first render.
  Only unreferenced rows older than 24 hours go.
  The grace window protects an image pasted into a card that is not saved yet, including from another web tab.
- [x] Future large media (audio, video) — metadata always in `attachments`.
  Byte placement becomes a per-attachment store choice by size threshold when video arrives.
  Hash ids mean a migration moves bytes only; content and refs never change.
- [x] Desktop transport — base64 inside the existing IPC for v1.
  `toWire` walks a `Uint8Array` as a plain object, so raw bytes cannot cross as-is.
  A binary channel or protocol handler can come later.
- [x] Playwright coverage — left out; the Manual verify blocks cover the media flows.

## Plan

- [ ] 1. Stop rendering data URL images
  Goal: In `libs/srs/src/lib/markdown.ts`, `isSafeImageUrl` stops accepting `data:` URLs.
  Such an image renders as its alt text, like a remote one.
  App-relative images stay.
  Update the WHY comment above `RELATIVE_IMAGE_BASE`.
  Split the "keeps relative and data images" test into a kept relative image and a dropped `data:` image.
  Update `docs/specs/CARDS.md` (§Rendered Markdown): images show only when they come from the app itself.
  Constraints: Leave both CSPs unchanged; the sanitizer owns this rule.
  Done when: `bunx vitest run --config libs/srs/vitest.config.mjs --configLoader runner markdown` and `bun run check:push` pass.
  Manual verify:
  - Host: web
  - Paths:
    - Deck → cards table → edit a markdown field to `![logo](data:image/gif;base64,R0lGODlhAQABAAAAACw=)` → save → preview shows "logo", not an image.
    - A card with `**bold**` and a link → preview renders both as before.
  Commit: Stop rendering data URL images in markdown
  Depends on: none

- [ ] 2. Add attachment domain twins
  Goal: Add the attachment domain to `libs/srs` and its Rust twin in `crates/koloda/src/domain/attachments.rs`.
  Types: `Attachment` meta (`id`, `mime`, `size`, nullable `width` and `height`, `createdAt`).
  Types: the add payload (bytes, optional `width` and `height`).
  `sniffImageMime(bytes)` returns `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/avif`, or nothing.
  AVIF is an ISO-BMFF `ftyp` box whose major or compatible brands include `avif` or `avis`.
  HEIC and other `ftyp` files are rejected.
  Validation rejects an unknown format with `validation.attachments.format`.
  It rejects more than 5,242,880 bytes with `validation.attachments.too-large`.
  Width and height, when present, are positive integers.
  An attachment ref is exactly `attachment:` plus 64 lowercase hex characters; export one shared pattern for it.
  Add both codes to `ERROR_MESSAGES` and Rust `error_codes`, with en and ru strings per `agents/I18N.md`.
  Constraints: Types and pure functions only; no SQL, IPC, or UI.
  Done when: each side has one table-driven sniff test and a cap test at the limit and one byte past it.
  Done when: scoped `srs` and `app` (error parity) tests and `cargo test -p koloda --test domain` pass.
  Manual verify: none — no UI surface yet.
  Commit: Add attachment domain twins
  Depends on: none

- [ ] 3. Store attachments on both backends
  Goal: Write `crates/koloda/src/migrations/V3__attachments.sql` (next free number) with two tables.
  `attachments`: `id` text PK, `mime` text NOT NULL, `size` integer NOT NULL, `width` integer, `height` integer,
  `created_at` integer NOT NULL.
  `attachment_bytes`: `id` text PK referencing `attachments(id)` ON DELETE CASCADE, `bytes` blob NOT NULL.
  No `updated_at`: rows never change, as with `reviews`.
  Follow the full `agents/DB.md` checklist and regenerate `schema-inventory.json`.
  Add the SHA-256 id exception next to the UUIDv7 rule in `agents/DB.md`.
  Add repos in `libs/db-sqlite/src/lib/attachments.ts` and `crates/koloda/src/repo/attachments.rs`: add, get meta, get bytes.
  Add computes the id itself (`crypto.subtle` on web, the `sha2` crate on desktop) and validates with item 2.
  Add is idempotent: re-adding the same bytes returns the existing row unchanged.
  Meta and bytes are written in one transaction.
  A byte-store module per backend is the only code that reads or writes `attachment_bytes`.
  Write `docs/decisions/MEDIA-STORAGE.md` per `agents/DECISIONS.md` and route it from `agents/INDEX.md`.
  It covers representation, hash ids, the table split and byte-store seam, validation in both repos,
  and card content as the only thing that keeps an attachment alive.
  Constraints: Do not touch the `cards` content shape, `Queries`, IPC, the renderer, or the editor.
  Done when: each backend has a full-field roundtrip and an idempotent re-add test.
  Done when: an add over the cap fails with its code and writes nothing (the repo guard, not the validator matrix).
  That test is a second door per `agents/TESTING.md`, so it carries a one-line WHY.
  Done when: a db-sqlite test writes and reads back three cap-sized blobs in a row.
  It guards the wa-sqlite heap reservation in `libs/db-sqlite/src/lib/db.ts`.
  Done when: `bunx nx test @koloda/db-sqlite`, `cargo test -p koloda`, and `bun run check:push` pass.
  Manual verify: none — nothing consumes attachments yet.
  Commit: Store attachments on both backends
  Depends on: 2

- [ ] 4. Render attachment images in card markdown
  Goal: Resolve attachment refs to images in card preview and lessons.
  In `libs/srs/src/lib/markdown.ts`, a dedicated `Marked` instance (not global `marked.use`) handles image tokens.
  An image whose URL is an attachment ref renders as `<img data-attachment-id="<id>" alt="…">` with no `src`.
  DOMPurify keeps `data-*` by default; do not widen its URI allowlist.
  Add `getAttachmentQuery(id)` (mime and bytes, or null) to `Queries` and `QUERIES_METHODS`.
  Implement it in both apps' `queries.ts`.
  Desktop adds `cmd_get_attachment` to `DataIpc`, the `data-ipc.ts` table, `KolodaDb`, the NAPI class, and `apps/electron/IPC.md`.
  The NAPI method queues its body through `KolodaDb::run` on the `koloda-db` worker, like every other method.
  Its `KolodaDb` member returns a Promise.
  Bytes cross as base64: `apps/electron/src-rust` encodes with the `base64` crate, and the renderer decodes.
  In `libs/srs-react`, a ref-counted object URL cache builds each Blob with the stored mime.
  The cache keeps a few released URLs in an LRU, revokes every URL it evicts, and does not cache a missing attachment.
  Bytes do not stay in the React Query cache (`gcTime: 0`); the Blob is the only copy.
  `LessonCardFieldMarkdown` fills `src`, `width`, and `height` for the refs in its HTML.
  It releases them when the HTML changes or the field unmounts.
  While an image loads, its place stays empty; an unknown or unreadable ref shows its alt text.
  Assistant messages get no resolver, so a ref there shows its alt text.
  Add `blob:` to `img-src` in `apps/web/index.html` and `apps/electron-react/index.html`.
  Update `docs/specs/CARDS.md` (§Rendered Markdown): images show for card attachments and the app's own files.
  Constraints: `markdownToHtml` stays sync.
  Constraints: No editor changes. Card content unchanged.
  Done when: `markdown.test.ts` covers a ref, and malformed refs (63 hex characters, uppercase) left as plain images.
  Done when: the cache has gated-promise tests for release before the load resolves, re-acquire from the LRU, and revoke on eviction.
  Done when: the base64 codec roundtrips a cap-sized payload (no spread into `String.fromCharCode`).
  Done when: scoped `srs`, `srs-react`, and `electron-react` tests and `bun run check:push` pass.
  Manual verify:
  - Host: web and desktop (CSP and IPC changed)
  - Paths:
    - Deck → cards table → edit a markdown field to `![missing](attachment:000…000)` (64 zeros) → preview shows "missing".
    - Start a lesson on a deck with markdown cards → formatting and links render as before.
  Commit: Render attachment images in card markdown
  Depends on: 1, 3

- [ ] 5. Insert images from the card editor
  Goal: In the add-card and card-details markdown fields, insert images from paste, drop, and a pick button.
  Add `addAttachmentMutation` to `Queries` and `QUERIES_METHODS`, and implement it in both apps' `queries.ts`.
  Desktop adds `cmd_add_attachment` through the same layers as item 4; the NAPI layer decodes base64.
  Only fields whose template type is `markdown` get insertion; `add-card.tsx` must thread the field type through.
  Paste and drop insert every image file, in order.
  Non-image files and plain-text pastes behave as today.
  When the clipboard holds image data and HTML (a browser "Copy image"), the image data wins.
  The pick button opens a file picker limited to the five accepted formats.
  Before sending bytes, check the size from the `File`, sniff, and read width and height with `createImageBitmap`.
  A decode failure is `validation.attachments.format`.
  On success, insert `![alt](attachment:<id>)` at the cursor.
  Alt is the file name without its extension for picked and dropped files, with `[`, `]`, and `\` escaped.
  Pasted clipboard images get an empty alt; their file name is always `image.png`.
  Errors show on that field with the item 2 codes.
  Write `docs/specs/MEDIA.md` per `agents/FUNCTIONAL-SPECIFICATIONS.md`.
  It covers insertion flows, formats, the cap, where images render, and what shows instead.
  Point `docs/specs/CARDS.md` Scope at it and add routing rows in `agents/INDEX.md`.
  Constraints: Text fields and the cards table stay untouched. No URL fetching.
  Done when: unit tests cover the pure insertion helper (cursor at start, middle, end, over a selection) and alt escaping.
  Done when: scoped `srs-react` and `electron-react` tests and `bun run check:push` pass.
  Manual verify:
  - Host: web and desktop (IPC changed)
  - Paths:
    - Deck → add card → paste a screenshot into a markdown field → a ref appears at the cursor → save → preview shows the image.
    - Cards table → edit a card → drop a PNG onto a markdown field → ref alt is the file name → a lesson shows the image.
    - Pick a WebP with the button → save → reload (web) or relaunch (desktop) → the image still shows.
    - Drop an SVG, then a 6 MB JPEG → each shows a validation error and inserts nothing.
    - Paste plain text into a markdown field → it pastes as before.
  Commit: Insert images from the card editor
  Depends on: 4

- [ ] 6. Sweep unreferenced attachments
  Goal: Delete attachments no card references, once per app session after the first render.
  Both repos run the same statement:
  `DELETE FROM attachments WHERE created_at < ? AND NOT EXISTS (SELECT 1 FROM cards WHERE instr(cards.content, 'attachment:' || attachments.id) > 0)`.
  Bytes go through the `attachment_bytes` cascade.
  Hex ids cannot be hidden by JSON escaping, so no ref parser is needed.
  Add `sweepAttachmentsMutation` (a cutoff timestamp) to `Queries` and `QUERIES_METHODS`, and to both apps' `queries.ts`.
  Desktop adds `cmd_sweep_attachments` through the same layers as item 4.
  `App` in `libs/app-react` calls it once after mount, with a cutoff of now minus 24 hours.
  A sweep failure is logged and never shown.
  Add the cleanup rule to `docs/specs/MEDIA.md`.
  Constraints: No user-facing surface.
  Constraints: Do not sweep before the first render; the web database opens on the startup path.
  Done when: integration tests on both backends cover a referenced row surviving (ref in a non-first field).
  Done when: an unreferenced row older than the cutoff is removed with its bytes, and one created at the cutoff survives.
  Done when: `bunx nx test @koloda/db-sqlite`, `cargo test -p koloda --test integration`, and `bun run check:push` pass.
  Manual verify: none — the sweep only removes day-old rows that nothing references.
  Commit: Sweep unreferenced attachments after startup
  Depends on: 5

- [ ] 7. Embed pasted image URLs on desktop
  Goal: In the desktop app, let a pasted image URL become an attachment.
  When the pasted text in a markdown field is exactly one `http:` or `https:` URL, it pastes as text as today.
  An "Embed image" action then appears on that field until its next edit.
  The action swaps that pasted URL for `![alt](attachment:<id>)`; alt is the URL's last path segment without its extension, escaped as in item 5.
  The fetch runs in the main process, in a new `apps/electron/src/media-ipc.ts`.
  It registers `cmd_add_attachment_from_url` `{ url }` → attachment meta, with `assertAppSender`.
  Add the channel to `DataIpc` and exclude it from `DataOnlyChannel` next to `AiChannel`; document it in `apps/electron/IPC.md`.
  The fetch sends no app cookies or credentials, allows only `http:` and `https:` (redirects included), and times out.
  It counts body bytes as they arrive and aborts past 5,242,880 with `validation.attachments.too-large`.
  It stores the bytes through `KolodaDb.addAttachment`, so the repo sniffs, hashes, and dedupes as for any add.
  `width` and `height` stay null for fetched images.
  Network failure, timeout, and a non-2xx status are `attachments.fetch`.
  Add it to `ERROR_MESSAGES` with en and ru strings, and to the TS-only allow-list in `error-parity.test.ts`.
  The renderer learns of the capability from a nullable host value in `@koloda/core-react`, set only by `apps/electron-react`.
  It is not a `Queries` method, so the web app implements nothing and shows no action.
  Update `docs/specs/MEDIA.md`: the desktop flow, and that in the web demo a pasted URL stays text.
  Constraints: No fetching at render time. No change to web behavior.
  Done when: main-side tests drive the fetch helper with constructed `Response` streams.
  They cover an over-cap body aborted with its code, a non-2xx status, and a rejected `file:` URL.
  Done when: unit tests cover the swap helper (URL still in place, URL edited away).
  Done when: scoped `electron`, `srs-react`, and `app` tests and `bun run check:push` pass.
  Manual verify:
  - Host: desktop
  - Paths:
    - Add card → paste an image URL into a markdown field → it pastes as text → click "Embed image" → the URL becomes a ref → save → preview shows the image.
    - Relaunch with networking off → the lesson still shows the image.
    - Paste a URL to an HTML page → "Embed image" → a format error, and the URL stays as text.
    - Paste a URL, then type → the action disappears.
  Commit: Embed pasted image URLs on desktop
  Depends on: 5

## Outcome

(filled at archive)
