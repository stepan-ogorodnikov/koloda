# @koloda/srs-sqlite

SQLite Drizzle schema only — input for `drizzle-kit` to generate desktop SQLite migrations.
No runtime repos and no app imports; desktop persistence runs in Rust.

## Where it sits

Referenced by `drizzle.config.sqlite.ts` and the schema-change workflow in `agents/DB.md`.
Must stay structurally equivalent to `libs/srs-pgsql/src/lib/schema.ts` (same tables and columns; dialect-appropriate column types).

## Architectural Map

- Schema: `schema.ts` — SQLite mirror of the PG schema (`integer` timestamps, `text` JSON, shared names).

### Does NOT own (prevent scope creep)

- Repo functions or validation — `@koloda/srs-pgsql` (web), `crates/koloda-core/src/repo` (desktop)
- Generated Drizzle SQL — `drizzle/sqlite/`
- Embedded desktop migrations — `crates/koloda-core/src/migrations/` (hand-ported Refinery)
- Any application or React code

## Read next

- `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md` — why SQLite is schema-only here and runtime is Rust
- `agents/DB.md` — update both dialects, generate, then port to Refinery
