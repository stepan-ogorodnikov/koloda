# @koloda/db-sqlite

SQLite persistence for the web host: `wa-sqlite` with `IDBBatchAtomicVFS`.
IndexedDB database name is `koloda`.
Every connection sets `PRAGMA foreign_keys = ON`.

## Where it sits

Not yet wired to `apps/web` (`@koloda/db-pglite` still is).
Desktop apps do not use this package; they call `koloda` via NAPI.

## Architectural Map

- DB handle: `db.ts` — open/close, exec, parameterized query, IndexedDB `koloda`.
- Tests: persist/reload through `fake-indexeddb`.

### Does NOT own (prevent scope creep)

- Domain business rules — `@koloda/srs`
- SQLite / Refinery SQL source — `crates/koloda` only
- React UI
- OPFS

## Read next

- `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md` — why web owns persistence in-process
- `agents/DB.md` — schema and Refinery port
