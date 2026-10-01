# @koloda/db-sqlite

SQLite persistence for the web host: `wa-sqlite` with `IDBBatchAtomicVFS`.
IndexedDB database name is `koloda`.
Every connection sets `PRAGMA foreign_keys = ON`.
Product SQL is the shared Refinery series at `crates/koloda/src/migrations/V*.sql`.

## Where it sits

Wired to `apps/web`. Desktop apps do not use this package; they call `koloda` via NAPI.

## Architectural Map

- DB handle: `db.ts` — open/close, exec, parameterized query, transactions, IndexedDB `koloda`.
- Migrations: `migrate.ts` — apply Refinery SQL; `_migrations` bookkeeping (shared name with desktop; legacy web `__migrations` tables are renamed in place).
- Repos: `algorithms.ts`, `templates.ts`, `decks.ts`, `cards.ts`, `reviews.ts`, `lessons.ts`, `settings.ts`, `conversations.ts`.
- `getConversations` returns trimmed list items with `hasTurns` derived from `state` in TS; desktop `get_conversations` returns full rows including `state` (deliberate — see `crates/koloda/README.md`).
- Row mapping: `parse-rows.ts` — unix-ms ↔ `Date`, JSON text ↔ objects, `0/1` ↔ boolean.

### Does NOT own (prevent scope creep)

- Domain business rules — `@koloda/srs`
- SQLite / Refinery SQL source — `crates/koloda` only
- React UI
- OPFS

## Read next

- `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` (§Persistence owners) — why web owns persistence in-process
- `agents/DB.md` — schema and Refinery port
