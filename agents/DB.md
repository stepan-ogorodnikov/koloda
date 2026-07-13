### Database Migrations

Why two engines and ownership boundaries exist: `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md`.

- **Dual Drizzle Config**: Separate configs for each dialect
  - `drizzle.config.pgsql.ts`: PostgreSQL/PGlite for web
  - `drizzle.config.sqlite.ts`: SQLite/libSQL for desktop
- **Migration directories**:
  - `drizzle/pgsql/`: Generated PostgreSQL migrations (source of truth for web)
  - `drizzle/sqlite/`: Generated SQLite migrations (source of truth for desktop)
  - `crates/koloda-core/src/migrations/`: Refinery migrations embedded into the Rust core via `refinery::embed_migrations!("./")` at `crates/koloda-core/src/migrations/mod.rs:6`. Committed to the repo, hand-derived from `drizzle/sqlite/`. See workflow step 5 for the conversion rules.
- **Generate migrations**: `bun run db:generate` (generates both pgsql and sqlite)
- **Rust core owns the desktop schema**: `apps/native-electron/src-rust` is a consumer of `koloda-core`; it does not define or convert migrations itself.

#### Schema Change Workflow

When modifying database schema:

1. **Update both schemas** (they must stay in sync):
   - `libs/srs-pgsql/src/lib/schema.ts` - PostgreSQL schema for web (demo)
   - `libs/srs-sqlite/src/lib/schema.ts` - SQLite schema for desktop
2. **Update shared types** in `libs/srs/src/lib/` if adding new fields that need validation
3. **Update Rust domain types** in `crates/koloda-core/src/domain/` for desktop support
4. **Generate Drizzle migrations**: `bun run db:generate`
5. **Manually port the new SQLite migration** into Refinery format at `crates/koloda-core/src/migrations/V<next>__<name>.sql`:
   - Strip backticks and `--> statement-breakpoint` markers
   - Add `IF NOT EXISTS` to `CREATE TABLE` / `CREATE INDEX` / `CREATE UNIQUE INDEX`
   - Use the next sequential `V` number (drizzle number + 1), and keep the exact same name from the drizzle migration (the part after `0000_`). E.g. drizzle `0002_create_users.sql` → refinery `V3__create_users.sql`
6. **Verify**: `cargo check -p koloda-core` to ensure the embedded migrations compile
