### Database Migrations

Who owns persistence on each host, and why: `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` (§Persistence owners).

- **SQLite on both hosts**.
  Web uses `@koloda/db-sqlite` (`wa-sqlite` + `IDBBatchAtomicVFS`).
  Desktop uses SQLite via `koloda` Refinery.
- **One SQL series**: `crates/koloda/src/migrations/`.
  Desktop embeds it with `refinery::embed_migrations!("src/migrations")` in `crates/koloda/src/migrations/mod.rs`.
  Web applies the same `V*.sql` files in filename order through `@koloda/db-sqlite`.
  Both hosts record applied versions in a `_migrations` table private to each database
  (desktop `crates/koloda/src/app/db.rs`, web `libs/db-sqlite/src/lib/migrate.ts`, which renames
  pre-unification web `__migrations` tables in place).
- **Rust core owns the desktop connection**.
  `apps/electron/src-rust` consumes `koloda`; it does not define migrations.
- **Seed ids are shared**: both hosts use the `SEED_*` constants in `libs/app/src/lib/seed-ids.ts`
  (Rust twin `crates/koloda/src/domain/seed_ids.rs`).
  First-run content itself differs by host; see `docs/specs/INTERFACE-SETTINGS.md` (§First Setup).
- There is no Drizzle schema and no `db:generate` script.
- No `sync_*` tables yet; add them to this folder when sync work starts.

#### Schema Change Workflow

When modifying database schema:

1. **Hand-write the next file** at `crates/koloda/src/migrations/V{n}__<name>.sql`.
   `n` is max existing `V` plus 1.
   Never edit a file that has already been applied.
   A baseline reset (wipe local DBs and replace `V1`) is a pre-release exception, not the default.
   Do it only when the human asks for one.
   Product tables stay structurally equivalent across hosts (same names, nullability, FKs, indexes).
   No backticks in SQL.
   Add `IF NOT EXISTS` to `CREATE TABLE` / `CREATE INDEX` / `CREATE UNIQUE INDEX`.
   Storage conventions: timestamps are unix-ms integers, JSON is `text`, booleans are `0/1`.
   `reviews.due_at` is NOT NULL (FSRS always supplies `due`); `cards.due_at` is nullable (untouched cards).
   Product entity ids are client-minted UUIDv7 text primary keys.
   `attachments.id` is the exception: the repo sets it to the lowercase hex SHA-256 of the bytes
   (`docs/decisions/MEDIA-STORAGE.md`).
   `settings.id` stays `integer PRIMARY KEY AUTOINCREMENT` (rows are keyed by `name`).
   `conversations.id` stays text (v4 mint, not v7).
2. **Refresh the embedded listing**.
   Touch `crates/koloda/src/migrations/mod.rs` (or `cargo clean -p koloda`).
   `embed_migrations!` snapshots the directory at compile time.
   An incremental build will not embed a newly added file.
   Web snapshots the same directory at Vite build time (`import.meta.glob` in `libs/db-sqlite/src/lib/migrate.ts`) —
   rebuild `@koloda/db-sqlite` (or `nx reset`) after adding a migration so a stale cached bundle does not ship
   without the new file.
3. **Update domain types** in `libs/srs` / `@koloda/app` / `@koloda/settings` (Zod) and `crates/koloda/src/domain/` (Rust).
4. **Update both repo stacks** (`crates/koloda/src/repo/` and `libs/db-sqlite/src/lib/`).
5. **Update the inventory snapshot** at `crates/koloda/src/migrations/schema-inventory.json` if columns, indexes, or FKs changed.
   Regenerate from a migrated desktop DB with
   `cargo test -p koloda --test integration write_schema_inventory_snapshot -- --ignored`.
6. **Verify**.
   `cargo test -p koloda` (inventory lives in the integration crate).
   `bunx nx test @koloda/db-sqlite` (same JSON, web runner).
   Those tests fail if a column or FK `ON DELETE` diverges from the snapshot.
