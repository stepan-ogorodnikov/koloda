# koloda-sync

The sync engine on native devices: it calls `koloda-server` and drives `koloda`'s sync tables.
A library crate with no product surface: no app calls it yet, so `docs/decisions/APP-ROLES.md` has no row for it.
It links `koloda` and `koloda-sync-proto`; the web host never syncs.

## Where it sits

A native host starts one `Engine` per database file.
The contract is `crates/koloda-sync-proto/PROTOCOL.md`; endpoint bodies come from that crate's `transport.rs`.
`koloda` owns every sync table and SQL statement; the engine only calls its sync functions.
The engine owns a tokio runtime, so host calls block until done; database work runs on its blocking threads.
A device's bearer token lives in the host's secret store under `sync.token.<device id>`, and nowhere else.

## Architectural Map

- `src/lib.rs` — crate root.
- `src/engine.rs` — `Engine`: the runtime, host calls, space creation, and the session a cycle uses.
- `src/cycle.rs` — the cycle: the device record and the behind check, push, `hot` to head, `cold` to the recorded
  head, the skew pause, and repair after catch-up.
- `src/push.rs` — pushing the outbox in batches and handing each reply, loss, or refusal to `koloda`.
- `src/bootstrap.rs` — a joiner's union bootstrap from a snapshot lease: streams, catch-up, heartbeats, restarts.
- `src/client.rs` — CBOR and zstd bodies, the reply envelope, the skew estimate, retries, and the server URL rule.
- `src/transport.rs` — `Transport`, one request and its raw reply; `HttpTransport` sends it with reqwest.
- `src/error.rs` — `SyncError`.

- `tests/engine/` — one test binary; `common.rs` calls `koloda-server`'s router in process through a `Transport`,
  on a server clock offset from system time.

### Does NOT own (prevent scope creep)

- Sync tables, capture, apply, backfill, join, and repair — `koloda`
- Envelope encoding and endpoint bodies — `koloda-sync-proto`
- What the server stores and decides — `koloda-server`
- Commands, settings screens, and the join wizard — the native hosts

## Read next

- `crates/koloda-sync-proto/PROTOCOL.md` — the contract the engine follows
- `crates/koloda/README.md` — the sync functions the engine calls
- `agents/TESTING.md` — engine behavior is pinned by tests against the real server
