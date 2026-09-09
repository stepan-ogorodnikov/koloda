# Schema baseline (UUIDv7)

Status: done

## Intent

Replace the current integer product schema with a new SQLite baseline.
Do this as a wipe plus a new `V1`, not an `ALTER` and not `V6`.
Both hosts already apply `crates/koloda/src/migrations/*.sql` after [web-sqlite](./web-sqlite.md).
Product ids become client-minted UUIDv7 strings, the same on desktop and web.

Done when new installs apply one `V1__init.sql`.
Algorithms, templates, decks, cards, and reviews use text UUIDv7 primary keys.
Seed algorithms and templates use mirrored well-known ids.
A schema inventory snapshot matches both runners.
PGlite is already gone.
Existing local DBs are wiped, not migrated.

## Scope

In:

- Replace `V1`–`V5` with one `V1__init.sql` (current columns, UUIDv7 PKs, `ON DELETE NO ACTION`).
- Client-minted UUIDv7 ids in both repo stacks.
- UUID strings for template field ids and card content keys.
- Mirrored seed-id constants (TS + Rust).
- `reset_card_progress` must not stamp `updated_at` (CARDS.md).
- Leaf-first deletes in repos once CASCADE is gone.
- Schema inventory snapshot plus tests on both runners.
- Rewrite `agents/DB.md` for one SQL series, two runners, never-edit, wipe-reset, inventory.

Out:

- Starting before [web-sqlite](./web-sqlite.md) is `done`.
- Editing `tasks/live/web-sqlite.md` or redesigning the web migration runner.
- `reviews_reset_at`, `sync_*`, `koloda-server`, compiling `koloda` to WASM.
- Migrating existing desktop SQLite files or IndexedDB `koloda`.
- Changing conversation id mint (keep text, keep v4).
- Changing `settings.id` (keep integer `AUTOINCREMENT`; keyed by `name`).
- OPFS, COOP/COEP, Playwright WebKit.
- Additive `V2+` product columns.

## Open questions

- [x] When — after web-sqlite is `done`. Do not start on the integer / PGlite stack.
- [x] Cutover — wipe + new `V1`, not `ALTER`, not `V6`.
- [x] FKs — `ON DELETE NO ACTION` on product FKs. Repos delete children explicitly.
- [x] `settings.id` — remain integer `AUTOINCREMENT`. Learning defaults store UUID strings in JSON.
- [x] `conversations.id` — remain text. Keep `generate_uuid()` v4 for those rows.
- [x] Inventory — committed canonical JSON. Both runners assert it. Exclude bookkeeping tables.
- [x] Reset `updated_at` — do not stamp on reset. Fix desktop in the desktop repos item.
- [x] TS mint — `uuid` package `v7()`. Rust: `uuid` crate `v7` feature. New helper; do not change v4 conversation mint.

## Plan

- [x] 1. Replace Refinery series with UUIDv7 V1
  Goal: Delete `crates/koloda/src/migrations/V1`–`V5`.
  Write one `V1__init.sql` that is the current product schema with text primary keys for
  `algorithms`, `templates`, `decks`, `cards`, and `reviews`.
  Keep `settings.id` as `integer PRIMARY KEY AUTOINCREMENT`.
  Keep `conversations.id` as `text PRIMARY KEY`.
  Keep current columns and indexes (`reviews.time`, `conversations.title`,
  `learning_steps`, the V5 FK indexes).
  Timestamps stay unix-ms integers. JSON stays `text`. Booleans stay `integer` 0/1.
  Every product FK is `ON DELETE NO ACTION` / `ON UPDATE NO ACTION`.
  `CREATE TABLE` / `CREATE INDEX` keep `IF NOT EXISTS`. No backticks.
  No `reviews_reset_at`. No `sync_*`.
  Touch `crates/koloda/src/migrations/mod.rs` so `embed_migrations!` picks up the new file.
  Constraints: Do not change repos, Zod, NAPI, or apps.
  Do not add `V6`.
  Do not copy PG drizzle SQL.
  Do not edit `tasks/live/web-sqlite.md`.
  Green: no — restored by item 4
  Done when: `migrations/` contains only `V1__init.sql` and `mod.rs`.
  The file has the tables, PKs, FKs, and indexes named above.
  Depends on: none (but do not start until web-sqlite is done)
  Commit: Start the product schema from a UUIDv7 V1

- [x] 2. Switch domain ids to UUID strings
  Goal: Cut entity ids in Zod and Rust domain from integers to UUID strings.
  `algorithms`, `templates`, `decks`, `cards`, `reviews` ids: `z.uuid()` / `String`.
  `reviews.id` is no longer `bigint`.
  Template field `id` and layout `field` become UUID strings.
  `DEFAULT_TEMPLATE` and seed templates use frozen field UUIDs from the seed-id constants.
  Learning defaults `algorithm` / `template` become those UUID strings (`0` is gone).
  Add mirrored seed-id constants (TS + Rust) for well-known algorithms (`simple`, `complex`),
  templates (`type`, `reveal`), and their field ids.
  Hand-pick UUIDv7 literals; do not generate them at seed time.
  Update `libs/ai` tool schemas that take `deckId`.
  Drop `z.coerce.number()` on entity ids (that was a PG int4 leftover).
  Domain tests only: `cargo test -p koloda --test domain`, `@koloda/srs` and `@koloda/app` unit tests.
  Constraints: Do not change SQL, repos, or app seed/setup in this commit.
  Do not mint ids here.
  Green: no — restored by item 4
  Done when: domain unit tests named above pass.
  Seed-id constants exist on both sides with identical literals.
  Depends on: 1
  Commit: Replace integer entity ids in domain types

- [x] 3. Cut desktop persistence over to UUIDv7
  Goal: Desktop repos insert client-minted UUIDv7 ids (explicit `id` column, no `last_insert_rowid`
  for product tables).
  Add `generate_uuidv7()` next to `generate_uuid()`.
  Enable the `uuid` crate `v7` feature.
  Insert functions mint unless the caller passes `id` (seed uses the constants).
  `seed_db` writes the well-known default algorithm and template ids and points learning defaults at them.
  `reset_card_progress` must not set `updated_at`.
  Deletes are leaf-first (`reviews` then `cards` then `deck`; do not rely on CASCADE).
  Update NAPI (`apps/electron/src-rust`), `data-ipc.ts`, `apps/electron-react` queries, fixtures, and
  desktop tests.
  Constraints: Do not change `@koloda/db-sqlite` or `apps/web`.
  Do not add sync tables.
  Green: no — restored by item 4
  Done when: `cargo test -p koloda` passes.
  Electron unit tests pass.
  A wiped desktop DB starts and seeds with the well-known ids.
  Depends on: 2
  Commit: Persist desktop rows with client-minted UUIDv7 ids

- [x] 4. Cut web persistence over to UUIDv7
  Goal: `@koloda/db-sqlite` repos mint UUIDv7 the same way (dependency: `uuid` `v7()`).
  Inserts write `id`; stop using `last_insert_rowid()` for product tables.
  `createTestDb` / integration tests use string ids.
  Web seed keeps aliases (`simple`, `type`, …) and maps them to the seed-id constants.
  `setupFromScratch` inserts those ids and points learning defaults at them.
  Card content keys are the template field UUIDs, not `"1"` / `"2"`.
  Reset progress does not stamp `updated_at`.
  Deletes are leaf-first.
  Wire any remaining `apps/web` call sites (`setup.ts`, `queries.ts`, e2e).
  Constraints: Do not change the IndexedDB name (`koloda`).
  Do not redesign the migration runner except if it cannot apply a single `V1` file.
  Do not add OPFS.
  Done when: `bunx nx test @koloda/db-sqlite` passes.
  `bunx nx run web-e2e:e2e` passes.
  `cargo test -p koloda` still passes.
  Typecheck, lint, and dprint fmt pass.
  A wiped IndexedDB `koloda` setup still has data after reload.
  Depends on: 3
  Commit: Persist web rows with client-minted UUIDv7 ids

- [x] 5. Add schema inventory and rewrite DB.md
  Goal: After migrate, dump product schema from both runners and assert one committed JSON snapshot.
  Include tables, columns (`name`, `type`, `notnull`, `pk`, `dflt_value`), indexes, and foreign keys
  (`from`, `to`, `on_delete`, `on_update`).
  Sort canonically.
  Exclude bookkeeping tables (`_migrations`, web's migrations table).
  Put the snapshot next to the SQL (crate) or under `tools/`; both the Rust test and the
  `@koloda/db-sqlite` test read the same file.
  Rewrite `agents/DB.md`: one series at `crates/koloda/src/migrations/`, two runners, hand-write the
  next `V{n}`, never edit an applied file, baseline reset is wipe + replace `V1` (pre-release only),
  touch `mod.rs`, update Zod and Rust domain and both repos, run the inventory tests.
  Drop the dialect map if it is still there.
  Mention that `sync_*` stays out of this folder until Phase 1.
  Constraints: No behavior change.
  Do not rewrite ADR 0002 unless a UUID sentence is missing after web-sqlite.
  Done when: `cargo test -p koloda` and `bunx nx test @koloda/db-sqlite` fail if a column or FK
  on-delete diverges from the snapshot.
  `agents/DB.md` matches the workflow above.
  Depends on: 4
  Commit: Gate schema changes with a SQLite inventory check

## Outcome

New installs apply one `V1__init.sql`.
Product ids are client-minted UUIDv7 text on desktop and web.
Seed algorithms and templates use mirrored well-known ids.
`crates/koloda/src/migrations/schema-inventory.json` is the schema gate for both runners.
Existing local DBs are wiped, not migrated.
