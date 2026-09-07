### Database Migrations

Why two engines and ownership boundaries exist: `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md`.

- **Dual engines** (ADR 0002).
  Web uses PGlite/Postgres via `@koloda/srs-pgsql`.
  Desktop uses SQLite via `koloda-core` Refinery.
- **Drizzle is PG-only**: `drizzle.config.pgsql.ts` generates into `drizzle/pgsql/`.
- **Generate migrations**: `bun run db:generate` (PostgreSQL only).
- **Desktop source of truth**: `crates/koloda-core/src/migrations/`.
  Embedded via `refinery::embed_migrations!("src/migrations")` in `crates/koloda-core/src/migrations/mod.rs`.
- There is no TypeScript SQLite schema. Drizzle does not emit SQLite migrations.
- **Rust core owns the desktop schema**.
  `apps/native-electron/src-rust` consumes `koloda-core`; it does not define migrations.

#### Schema Change Workflow

When modifying database schema:

1. **Update the PG schema**: `libs/srs-pgsql/src/lib/schema.ts` (web).
2. **Update shared types** in `libs/srs/src/lib/` if new fields need validation.
3. **Update Rust domain types** in `crates/koloda-core/src/domain/` for desktop.
4. **Generate PG migrations**: `bun run db:generate`.
5. **Hand-write the matching Refinery migration** at `crates/koloda-core/src/migrations/V<next>__<name>.sql`.
   - Write SQLite SQL from table/column intent (PG schema + generated PG migration as a checklist).
   - Do not paste Postgres DDL.
   - Do not dump from a TypeScript SQLite schema.
   - Map types using the dialect table below.
   - Product tables and columns stay structurally equivalent (same names, nullability, FKs, indexes).
   - No backticks in Refinery SQL.
   - Add `IF NOT EXISTS` to `CREATE TABLE` / `CREATE INDEX` / `CREATE UNIQUE INDEX`.
   - Next `V` number is max existing `V` + 1 (currently V1–V5, so next is V6).
6. **Refresh the embedded migrations**.
   Touch `crates/koloda-core/src/migrations/mod.rs` (or `cargo clean -p koloda-core`).
   `embed_migrations!` snapshots the directory listing at compile time.
   An incremental build will not embed a newly added file.
   Tests would silently run against the old schema.
7. **Verify**: `cargo check -p koloda-core` so the embedded migrations compile.

#### Dialect map (PG Drizzle / Postgres → SQLite Refinery)

Write Refinery SQL from intent, not by pasting Postgres DDL.

| PG (Drizzle schema / drizzle SQL) | SQLite (Refinery) |
| --- | --- |
| `generatedAlwaysAsIdentity()` / identity | `integer PRIMARY KEY AUTOINCREMENT` |
| `bigint` identity (e.g. reviews.id) | `integer PRIMARY KEY AUTOINCREMENT` (do not keep bigint) |
| `timestamp` / timestamptz | `integer` (unix milliseconds) |
| `jsonb` | `text` |
| `varchar` / `varchar(n)` | `text` |
| `boolean` | `integer` (0/1) |
| `smallint` | `integer` |
| `real` | `real` |
| `integer` (non-identity) | `integer` |
