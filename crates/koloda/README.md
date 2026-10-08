# koloda

Desktop Rust backend (domain, repos, SQLite/Refinery, keyring).
Not the TypeScript apps and not `@koloda/db-sqlite`.
Not an npm package — consumed by Electron (NAPI) command layer.

## Where it sits

Consumed by `apps/electron`.
TS apps reach it through `invoke("cmd_*")` in their `queries.ts`.
Mirrors `@koloda/srs` + `@koloda/app` domain types and the repo surface of `@koloda/db-sqlite`.
Deliberate divergence: `get_conversations` returns full rows including opaque `state` where `@koloda/db-sqlite` returns trimmed list items — `hasTurns` derives from `state` in TS only (`libs/app` invariant), so each sidebar query ships every state over NAPI+IPC to the renderer.
Rust is the source of truth for the AI provider enum and secrets redaction; `@koloda/ai` mirrors those.

## Architectural Map

- Domain: `domain/` — cards (`CardState`), shared FSRS progress validators (`progress`), decks, templates, algorithms/`AlgorithmFSRS`, lessons, reviews, conversations (opaque `state`), settings slices (`LearningDefaults`, `DailyLimits`), `ai`, attachments (format sniffing, size cap), timestamp serde (`time`).
- Repos: `repo/` — SQLite repos parallel to `@koloda/db-sqlite` (plus AI secrets redaction/reconstruction). Owns `rusqlite` adapters (e.g. `FromSql` for `SettingsName`).
  `repo/attachment_bytes.rs` is the only reader and writer of `attachment_bytes` (`docs/decisions/MEDIA-STORAGE.md`).
  `repo/sync/` owns the `sync_*` tables; `mod.rs` enrolls the device.
  Product writes record sync envelopes through `Capture` in `capture.rs`.
  `backfill.rs` moves rows written before enrollment into the outbox in bounded batches.
  `join.rs` tells a joining file's mode, records its claim, and lists the ids the space is probed for.
  It then remints known rows on Add, or deletes product rows on Replace; a blank joiner seeds with `seed_joiner_db`.
  `apply_page` in `apply.rs` applies envelopes other devices captured, and `apply_snapshot_page` a bootstrap
  snapshot's; both stop at the first entry this app cannot read and return it as a `Hold`.
  `repair.rs` repoints pointers to dead rows.
  `outbox.rs` picks push batches of whole cohorts and settles each reply, lost reply, or refusal in one transaction.
  `release_held` moves writes held for `quota` back to the outbox once the space has room.
  It also tells whether the file is behind its own device record.
  `attachments.rs` queues image uploads that push outcomes ask for and fetches of images remote cards link, and
  stores fetched bytes through the same insert as a local add.
  `restamp.rs` gives each pending `local` cohort a new stamp after a clock correction or a new device id.
  `rebase.rs` opens a re-bootstrap's barrier and, once its stream is applied, deletes what the server no longer holds.
  `switch.rs` moves a file to a new device id: it settles what the old sender's receipts show accepted, renumbers the
  rest, and re-stamps the cohorts no receipt touched.
  `heal.rs` re-pushes, after a server restore, every write above its sender's cutoff, re-encoded from the row with its
  stored stamp.
  `authoritative.rs` records an authoritative restore and, once the host accepts it, discards product rows and sync
  tables so the file bootstraps from the backup.
- App runtime: `app/` — DB connection (`parse_json_column` for JSON TEXT columns), init/seed, keyring secrets, clock/UUID helpers.
- Shared errors: `app::error` (`AppError` + `error_codes`) is the intentional crate-wide error type. Domain validation returns it so codes stay aligned with `@koloda/app`; domain must not import `rusqlite`.
- Migrations: `migrations/` — owned Refinery SQL embedded via `embed_migrations!`.
  Product SQL source for both hosts (`agents/DB.md`).

### Does NOT own (prevent scope creep)

- React UI or TanStack Query — TS libs and apps
- Web SQLite / IndexedDB — `@koloda/db-sqlite`
- Vercel AI SDK streaming — `@koloda/ai`

## Read next

- `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` — why this crate exists beside the TS domain
  (§Persistence owners covers desktop vs web SQLite ownership)
- `agents/DB.md` — schema workflow; Rust owns the embedded desktop migrations
- `agents/ADD-AI-PROVIDER.md` — Rust domain + repo + secrets redaction
- `agents/ADD-HOTKEY.md` — `domain/settings_hotkeys.rs`
- `agents/BACKWARDS-COMPATIBILITY.md` — pre-release; no compat shims
- `libs/assistant/README.md` — save-queue and shutdown invariants the desktop repo must uphold
