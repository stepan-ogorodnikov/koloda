### Database Migrations

Why two ownership boundaries exist: `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md`.

- **SQLite on both hosts** (ADR 0002).
  Web uses `@koloda/db-sqlite` (`wa-sqlite` + `IDBBatchAtomicVFS`).
  Desktop uses SQLite via `koloda` Refinery.
- **One SQL series**: `crates/koloda/src/migrations/`.
  Desktop embeds it with `refinery::embed_migrations!("src/migrations")` in `crates/koloda/src/migrations/mod.rs`.
  Web applies the same `V*.sql` files in filename order through `@koloda/db-sqlite`.
- **Rust core owns the desktop connection**.
  `apps/electron/src-rust` consumes `koloda`; it does not define migrations.
- There is no Drizzle schema and no `db:generate` script.
- `sync_*` tables stay out of this folder until Phase 1.

#### Schema Change Workflow

When modifying database schema:

1. **Hand-write the next file** at `crates/koloda/src/migrations/V{n}__<name>.sql`.
   `n` is max existing `V` plus 1.
   Never edit a file that has already been applied.
   Pre-release baseline reset is wipe local DBs and replace `V1`.
   Do not `ALTER` the old integer schema.
   Do not add `V6` on top of it.
   Product tables stay structurally equivalent across hosts (same names, nullability, FKs, indexes).
   No backticks in SQL.
   Add `IF NOT EXISTS` to `CREATE TABLE` / `CREATE INDEX` / `CREATE UNIQUE INDEX`.
   Storage conventions: timestamps are unix-ms integers, JSON is `text`, booleans are `0/1`.
   Product entity ids are client-minted UUIDv7 text primary keys.
   `settings.id` stays `integer PRIMARY KEY AUTOINCREMENT` (rows are keyed by `name`).
   `conversations.id` stays text (v4 mint, not v7).
2. **Refresh the embedded listing**.
   Touch `crates/koloda/src/migrations/mod.rs` (or `cargo clean -p koloda`).
   `embed_migrations!` snapshots the directory at compile time.
   An incremental build will not embed a newly added file.
3. **Update domain types** in `libs/srs` / `@koloda/app` / `@koloda/settings` (Zod) and `crates/koloda/src/domain/` (Rust).
4. **Update both repo stacks** (`crates/koloda/src/repo/` and `libs/db-sqlite/src/lib/`).
5. **Update the inventory snapshot** at `crates/koloda/src/migrations/schema-inventory.json` if columns, indexes, or FKs changed.
   Regenerate from a migrated desktop DB with
   `cargo test -p koloda --test integration write_schema_inventory_snapshot -- --ignored`.
6. **Verify**.
   `cargo test -p koloda` (inventory lives in the integration crate).
   `bunx nx test @koloda/db-sqlite` (same JSON, web runner).
   Those tests fail if a column or FK `ON DELETE` diverges from the snapshot.
