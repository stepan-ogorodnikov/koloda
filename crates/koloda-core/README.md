# koloda-core

Desktop source-of-truth backend: SQLite via rusqlite, embedded Refinery migrations, domain types, repos, and OS keyring secrets.
Not an npm package — consumed by Electron (NAPI) command layer.

## Where it sits

Consumed by `apps/native-electron`.
TS apps reach it through `invoke("cmd_*")` in their `queries.ts`.
Mirrors `@koloda/srs` + `@koloda/app` domain types and the repo surface of `@koloda/srs-pgsql`.
Rust is the source of truth for the AI provider enum and secrets redaction; `@koloda/ai` mirrors those.

## Architectural Map

- Domain: `domain/` — cards (`CardState`), shared FSRS progress validators (`progress`), decks, templates, algorithms/`AlgorithmFSRS`, lessons, reviews, conversations (opaque `state`), settings slices (`LearningDefaults`, `DailyLimits`), `ai`, timestamp serde (`time`).
- Repos: `repo/` — SQLite repos parallel to `@koloda/srs-pgsql` (plus AI secrets redaction/reconstruction). Owns `rusqlite` adapters (e.g. `FromSql` for `SettingsName`).
- App runtime: `app/` — DB connection, init/seed, keyring secrets, clock/UUID helpers.
- Shared errors: `app::error` (`AppError` + `error_codes`) is the intentional crate-wide error type. Domain validation returns it so codes stay aligned with `@koloda/app`; domain must not import `rusqlite`.
- Migrations: `migrations/` — Refinery SQL embedded via `embed_migrations!`; hand-ported from `drizzle/sqlite/`.

### Does NOT own (prevent scope creep)

- React UI or TanStack Query — TS libs and apps
- PGlite / Drizzle PG schema — `@koloda/srs-pgsql`
- SQLite Drizzle schema generation input — `@koloda/srs-sqlite` (then `drizzle/sqlite/`)
- Vercel AI SDK streaming — `@koloda/ai`

## Read next

- `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` — why this crate exists beside the TS domain
- `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md` — desktop SQLite ownership vs web PGlite
- `agents/DB.md` — schema workflow; Rust owns the embedded desktop migrations
- `agents/ADD-AI-PROVIDER.md` — Rust domain + repo + secrets redaction
- `agents/ADD-HOTKEY.md` — `domain/settings_hotkeys.rs`
- `agents/BACKWARDS-COMPATIBILITY.md` — pre-release; no compat shims
- `agents/ASSISTANT-CHAT-MAP.md` — persistence invariants that repos must uphold
