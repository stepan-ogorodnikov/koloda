# koloda-sync-proto

Sync wire protocol: what devices and the sync server exchange.
Pure Rust: no database, no network, no clock source.
Not an npm package and not linked by the web host, which does not sync.

## Where it sits

The protocol contract is `PROTOCOL.md`.
This crate is its executable half; change both in the same commit.
The sync server (`crates/koloda-server`) and the sync engine (`crates/koloda-sync`) link it.
The server links only this crate, never `koloda`, so nothing here may depend on `koloda`.

## Architectural Map

- `src/lib.rs` — crate root.
- `src/envelope.rs` — envelope frame and header codec, header validation, the key a newer writer added, digest, and
  size limits.
- `src/hlc.rs` — hybrid logical clock, stamp order, and skew guards; callers pass time in.
- `src/payload.rs` — schema-1 payloads for every group, and sealing: header from payload, then a round-trip check.
- `src/registry.rs` — kinds, field groups, classes, lanes, parents, refs, and the header allowlist.
- `src/transport.rs` — endpoint bodies, the reply envelope, error codes, the epoch and schemas headers, and the request
  limits both sides enforce.

- `tests/protocol/` — one test binary; `samples.rs` holds one sample per group.
- `fixtures/` — golden sealed bytes of each sample, as hex; `fixtures_tests.rs` says how to regenerate them.

### Does NOT own (prevent scope creep)

- Sync tables, capture, apply, and repair — the native persistence layer (`koloda`)
- Sending requests, cursors, and the sync cycle — the sync engine (`koloda-sync`)
- Server storage, compaction, and restore — the sync server
- User-visible sync behavior — functional specs under `docs/specs/`

## Read next

- `PROTOCOL.md` — the contract this crate implements
- `agents/TESTING.md` — wire formats are pinned by tests
