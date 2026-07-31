# @koloda/srs-pgsql

PostgreSQL/PGlite persistence for the web demo: Drizzle schema, typed `DB`, and async repos for SRS entities, settings, and conversations.
Validates through `@koloda/srs` / `@koloda/app` schemas on write. On read, raw SQL always goes through mandatory `parse*` helpers; typed Drizzle paths use gated `assert*` tripwires (`parse-rows.ts` + `*RowSchema`) that skip parsing in production.

## Where it sits

Consumed by `apps/demo` (`queries.ts`, `db.ts`, `ai.ts`).
Desktop apps do not use this package; they call `koloda-core` via NAPI.
Depends on `@koloda/app` and `@koloda/srs`.

## Architectural Map

- Schema: `schema.ts` — Drizzle PG tables (`settings`, `algorithms`, `templates`, `decks`, `cards`, `reviews`, `conversations`).
- DB handle: `db.ts` — `DB` type (`PgliteDatabase<Schema>`), `withUpdatedAt()`.
- Repos: `settings.ts`, `conversations.ts`, `algorithms.ts`, `templates.ts`, `decks.ts`, `cards.ts`, `lessons.ts`, `reviews.ts`.
- Row boundary: `parse-rows.ts` — mandatory `parse*` for unknown-shape SQL rows; gated `assert*` for typed Drizzle `.select()` / `.returning()` (skipped when `NODE_ENV === "production"`). Domain shapes live in `*RowSchema` exports from `@koloda/srs` / `@koloda/app`.
- Tests: `*.integration.test.ts` — PGlite integration coverage.

### Does NOT own (prevent scope creep)

- Domain business rules — `@koloda/srs`
- SQLite schema / Refinery migrations — `@koloda/srs-sqlite`, `crates/koloda-core`
- React UI — `@koloda/srs-react`
- Provider HTTP — `@koloda/ai`

## Read next

- `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md` — why web owns PGlite in-process
- `agents/DB.md` — dual-dialect schema workflow and Rust Refinery port
- `drizzle.config.pgsql.ts`, `drizzle/pgsql/` — generated PG migrations
