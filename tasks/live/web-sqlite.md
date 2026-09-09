# Web SQLite (current schema)

Status: ready

## Intent

Run the web host on SQLite in the browser, against the **current** product schema.
Keep integer PKs, current Refinery `V1`–`V5`, and the same repo surface as `@koloda/db-pglite`.
The engine is `wa-sqlite` with `IDBBatchAtomicVFS`.
The package is `@koloda/db-sqlite`.

Done when web uses `@koloda/db-sqlite`.
PGlite and Drizzle are gone.
A reload still has the data.
Web integration tests and `web-e2e` pass.
Desktop is untouched.

## Scope

In:

- New lib `libs/db-sqlite` (`@koloda/db-sqlite`).
- Apply `crates/koloda/src/migrations/V1`–`V5` as written (including `ON DELETE CASCADE`).
- Rewrite web repos as parameterized SQLite (no Drizzle).
  Same exports as `db-pglite` minus the PG `schema`.
- Map SQLite storage to existing Zod shapes: unix-ms integers ↔ `Date`, JSON `text` ↔ objects, `0/1` ↔ boolean,
  `reviews.id` number ↔ `bigint`.
- Stamp `created_at` / `updated_at` in the repo (unix-ms), not `CURRENT_TIMESTAMP`.
- `hasTurns` in JS after parsing `conversations.state`.
- `PRAGMA foreign_keys = ON` on every connection.
- IndexedDB database name `koloda` (same as today's PGlite). Leftover PGlite bytes are not migrated.
- Wire `apps/web` (`db.ts`, `setup.ts`, `queries.ts`, `ai.ts`, `ai-runtime.ts`).
- Delete `@koloda/db-pglite`, `drizzle/`, `drizzle.config.pgsql.ts`, `db:generate*`,
  `drizzle-orm`, `drizzle-kit`, `drizzle-zod`, `@electric-sql/pglite`.
- Workspace-deps, tsconfig references, nx inputs, TESTING.md, ADR 0002, `agents/DB.md`, READMEs.

Out:

- UUIDv7 cutover, seed-id constants, `ON DELETE NO ACTION`, reset `updated_at` fix.
- `reviews_reset_at`, `sync_*`, `koloda-server`, compiling `koloda` to WASM.
- Changing desktop migrations or rusqlite repos except as the SQL source we apply.
- Migrating existing PGlite IndexedDB (pre-release wipe).
- OPFS, COOP/COEP, Playwright WebKit.

## Open questions

- [x] Package name — `@koloda/db-sqlite` (`libs/db-sqlite`).
- [x] Engine — `wa-sqlite` + `IDBBatchAtomicVFS`.
- [x] Schema — current desktop Refinery series, not a new baseline.
- [x] Safari — manual reload + private window. Chromium e2e only.
- [x] IndexedDB database name — `koloda`.

## Plan

- [x] 1. Add db-sqlite lib
  Goal: Scaffold `libs/db-sqlite` like `@koloda/db-pglite` (package.json `type: module`, project.json `type:lib`,
  solution-style tsconfigs, vitest).
  Add `wa-sqlite` and a thin async wrapper around `IDBBatchAtomicVFS`.
  Open IndexedDB database `koloda`, `PRAGMA foreign_keys = ON`, exec SQL, close, reopen, read the row back.
  Use `fake-indexeddb` (or equivalent) so vitest in node can exercise IDB.
  Keep `@koloda/db-pglite` running the app.
  Register the package in root tsconfig and `PACKAGE_LAYERS` as persistence.
  Constraints: No product repos yet.
  Do not apply `V*.sql` yet unless needed for the persist test (a one-table scratch schema is enough).
  Do not add OPFS.
  Do not change `apps/web`.
  Done when: `bunx nx test @koloda/db-sqlite` passes persist/reload.
  Typecheck and lint pass.
  dprint fmt clean.
  Commit: Add db-sqlite lib
  Depends on: none

- [x] 2. Port web app onto existing SQLite schema
  Goal: Apply `crates/koloda/src/migrations/*.sql` in `V` order (read the files; do not copy PG drizzle SQL).
  Record applied names in a small SQLite bookkeeping table (not PG identity).
  Port every repo and integration test from `libs/db-pglite` (`algorithms`, `templates`, `decks`, `cards`, `reviews`,
  `lessons`, `settings`, `conversations`, referential integrity).
  Same public functions as today's `src/index.ts`, except do not export a Drizzle `schema`.
  `DB` is the wrapper type.
  Transactions must support `setupFromScratch` (one transaction for migrate + seed).
  Inserts use `last_insert_rowid()`; keep integer PKs.
  Always-on Zod `parse*` for every row; delete production-skip `assert*` (no Drizzle-typed rows).
  Port `test-helpers.ts` `createTestDb` onto this driver.
  CASCADE deletes stay as in the SQL; do not rewrite to leaf-first.
  Point `apps/web` at `@koloda/db-sqlite` (`db.ts`, `setup.ts`, `queries.ts`, `ai.ts`, `ai-runtime.ts`).
  IndexedDB name is `koloda`.
  Glob `crates/koloda/src/migrations/*.sql` (no `statement-breakpoint`).
  Exclude `wa-sqlite` from Vite `optimizeDeps`.
  Set workspace-deps exclusive consumer of `@koloda/db-sqlite` to `@koloda/web`.
  Leave `@koloda/db-pglite` in the repo unused.
  Constraints: Do not change Zod, NAPI, or `crates/koloda`.
  Do not delete PGlite or Drizzle yet.
  Do not add UUID columns.
  Done when: `bunx nx test @koloda/db-sqlite` passes the ported integration suite.
  `bunx nx run web-e2e:e2e` passes.
  Typecheck/lint/fmt pass.
  Reload keeps data in Chromium.
  Commit: Port web app onto existing SQLite schema
  Depends on: 1

- [ ] 3. Cleanup PGlite and Drizzle
  Goal: Delete `libs/db-pglite`, `drizzle/`, `drizzle.config.pgsql.ts`, `db:generate` scripts, and the drizzle/pglite packages.
  Update workspace-deps, tsconfig references, `nx.json` inputs, and `agents/TESTING.md`.
  Rewrite ADR 0002: keep TS-owns-web / Rust-owns-desktop; product SQL is SQLite on both hosts;
  drop "do not collapse dialects".
  Rewrite `agents/DB.md` and READMEs that name `db-pglite`.
  Constraints: No behavior change.
  Do not change Electron or `koloda` repos.
  Do not add WebKit e2e.
  Done when: `bun run check:workspace-deps` passes.
  `rg` finds no `pglite`, `drizzle-orm`, `drizzle-kit`, or `@electric-sql/pglite` in production sources.
  `bunx nx test @koloda/db-sqlite` and `bunx nx run web-e2e:e2e` still pass.
  `cargo test -p koloda` still passes.
  Safari reload + private window checked manually.
  Commit: Cleanup PGlite and Drizzle
  Depends on: 2

## Outcome

Not yet.
