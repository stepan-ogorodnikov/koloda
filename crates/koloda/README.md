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
  `apply_page` in `apply.rs` applies envelopes other devices captured; `repair.rs` repoints pointers to dead rows.
  `outbox.rs` picks push batches of whole cohorts and settles each reply, lost reply, or refusal in one transaction.
  It also tells whether the file is behind its own device record.
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
