### Database Migrations

- **Dual Drizzle Config**: Separate configs for each dialect
  - `drizzle.config.pgsql.ts`: PostgreSQL/PGlite for web
  - `drizzle.config.sqlite.ts`: SQLite/libSQL for desktop
- **Migration directories**:
  - `drizzle/pgsql/`: Generated PostgreSQL migrations
  - `drizzle/sqlite/`: Generated SQLite migrations
  - `apps/native-tauri/src-tauri/src/migrations/`: Refinery migrations (auto-generated, do not edit)
- **Generate migrations**: `bun run db:generate` (generates both pgsql and sqlite)
- **Tauri migration conversion**: The `build.rs` script at `apps/native-tauri/src-tauri/build.rs` automatically converts Drizzle migrations from `drizzle/sqlite/` to Refinery format during Rust builds

#### Schema Change Workflow

When modifying database schema:

1. **Update both schemas** (they must stay in sync):
   - `libs/srs-pgsql/src/lib/schema.ts` - PostgreSQL schema for web (demo)
   - `libs/srs-sqlite/src/lib/schema.ts` - SQLite schema for desktop (native-tauri)
2. **Update shared types** in `libs/srs/src/lib/` if adding new fields that need validation
3. **Update Rust domain types** in `apps/native-tauri/src-tauri/src/domain/` for desktop support
4. **Generate Drizzle migrations**: `bun run db:generate`
5. **Build Rust** (`nx lint native-tauri` or `cargo build`) to auto-convert migrations for Refinery
6. **Do NOT manually edit** files in `apps/native-tauri/src-tauri/src/migrations/` - they are auto-generated

