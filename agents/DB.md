### Database Migrations

Why two ownership boundaries exist: `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md`.

- **SQLite on both hosts** (ADR 0002).
  Web uses `@koloda/db-sqlite` (`wa-sqlite` + `IDBBatchAtomicVFS`).
  Desktop uses SQLite via `koloda` Refinery.
- **Product SQL source**: `crates/koloda/src/migrations/`.
  Embedded on desktop via `refinery::embed_migrations!("src/migrations")` in `crates/koloda/src/migrations/mod.rs`.
  Web applies the same `V*.sql` files in filename order through `@koloda/db-sqlite`.
- **Rust core owns the desktop connection**.
  `apps/electron/src-rust` consumes `koloda`; it does not define migrations.
- There is no Drizzle schema and no `db:generate` script.

#### Schema Change Workflow

When modifying database schema:

1. **Hand-write the Refinery migration** at `crates/koloda/src/migrations/V<next>__<name>.sql`.
   - Product tables and columns stay structurally equivalent across hosts (same names, nullability, FKs, indexes).
   - No backticks in Refinery SQL.
   - Add `IF NOT EXISTS` to `CREATE TABLE` / `CREATE INDEX` / `CREATE UNIQUE INDEX`.
   - Next `V` number is max existing `V` + 1 (currently V1–V5, so next is V6).
   - Storage conventions: timestamps are unix-ms integers, JSON is `text`, booleans are `0/1`,
     identity keys are `integer PRIMARY KEY AUTOINCREMENT`.
2. **Update shared types** in `libs/srs/src/lib/` (and `@koloda/app` / `@koloda/settings` as needed).
3. **Update Rust domain types** in `crates/koloda/src/domain/` for desktop.
4. **Refresh the embedded migrations**.
   Touch `crates/koloda/src/migrations/mod.rs` (or `cargo clean -p koloda`).
   `embed_migrations!` snapshots the directory listing at compile time.
   An incremental build will not embed a newly added file.
   Tests would silently run against the old schema.
5. **Verify**: `cargo check -p koloda` so the embedded migrations compile.
   `bunx nx test @koloda/db-sqlite` so web applies the new file.
