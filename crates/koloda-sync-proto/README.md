# koloda-sync-proto

Sync wire protocol: what devices and the sync server exchange.
Pure Rust: no database, no network, no clock source.
Not an npm package and not linked by the web host, which does not sync.

## Where it sits

The protocol contract is `PROTOCOL.md`.
This crate is its executable half; change both in the same commit.
The sync engine (in the native hosts) and the sync server will both link this crate.
The server links only this crate, never `koloda`, so nothing here may depend on `koloda`.

## Architectural Map

- `src/lib.rs` — crate root.
- `src/registry.rs` — kinds, field groups, classes, lanes, parents, refs, and the header allowlist.

### Does NOT own (prevent scope creep)

- Sync tables, capture, apply, and repair — the native persistence layer (`koloda`)
- Transport, cursors, and the sync cycle — the sync engine
- Server storage, compaction, and restore — the sync server
- User-visible sync behavior — functional specs under `docs/specs/`

## Read next

- `PROTOCOL.md` — the contract this crate implements
- `agents/TESTING.md` — wire formats are pinned by tests
