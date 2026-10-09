# koloda-sync

The sync engine on native devices: it calls `koloda-server` and drives `koloda`'s sync tables.
A library crate with no product surface: no app calls it yet, so `docs/decisions/APP-ROLES.md` has no row for it.
It links `koloda` and `koloda-sync-proto`; the web host never syncs.

## Where it sits

A native host starts one `Engine` per database file.
The contract is `crates/koloda-sync-proto/PROTOCOL.md`; endpoint bodies come from that crate's `transport.rs`.
`koloda` owns every sync table and SQL statement; the engine only calls its sync functions.
The engine owns a tokio runtime, so host calls block until done; database work runs on its blocking threads.
The host passes in the transport, and the reader of free disk space, `SystemDisk` outside tests.
The host starts the background runner with an event sink and tells it about local commits, nudges, and the network.
It reads `status`, and on mobile runs bounded `tick`s instead.
A device's bearer token lives in the host's secret store under `sync.token.<device id>`, and nowhere else.

## Architectural Map

- `src/lib.rs` — crate root.
- `src/engine.rs` — `Engine`: the runtime, host calls, space creation, the session a cycle uses, and running the
  cycle again on a restored epoch.
- `src/cycle.rs` — the cycle: the device record and the behind check, re-bootstrap when the server left the file
  behind, held writes released once the space has room, push, `hot` to head, `cold` to the recorded head, a lane held
  at an envelope this app cannot read, the skew pause, a push refused as ahead (re-stamped once, then waiting for
  server time), and repair after catch-up.
- `src/push.rs` — pushing the outbox in batches and handing each reply, loss, or refusal to `koloda`; heal and
  backfill top the outbox up before each batch.
- `src/restore.rs` — a server restore the server reported: heal starts the re-push scan; an authoritative restore is
  held until the host calls `accept_restore`, which discards local data so the next cycle bootstraps.
- `src/fork.rs` — a file behind its own record forks to a new device id: the stored nonce, the new token, receipts,
  and the switch.
- `src/pairing.rs` — pairing codes, preview, and joining a space: blank, seed-only, a used file through Add or
  Replace, or a detached file re-attaching under a new device id, after applying a restore the space had since.
- `src/runner.rs` — the background runner: triggers, coalescing, the poll and how long it waits while the events
  socket is open, backoff, events, and tick budgets.
- `src/events.rs` — the events socket while the runner runs: the session it listens with, reconnects, and nudges
  that start a cycle, held back while one runs.
- `src/status.rs` — the state the host shows, why the last cycle stopped (an authoritative restore waiting for the
  host among the reasons), the lane held at an envelope this app cannot read, whether the space is over its quota,
  whether bulk transfers wait on a metered network, when a push waiting for server time resumes, and how far behind
  each lane is.
- `src/devices.rs` — the device list, revoking another device, and detaching this file.
- `src/metered.rs` — bulk transfers on a metered network: the network the host reports, the bootstrap and outbox
  checks, the allowance counted work spends, and the call that lifts the pause.
- `src/disk.rs` — the free-disk preflight before a bootstrap applies, and the free-space reader the host passes in.
- `src/bootstrap.rs` — a joiner's union bootstrap and a re-bootstrap from a snapshot lease: streams, catch-up,
  heartbeats, restarts, a stop that gives the lease back at an envelope this app cannot read, and the re-bootstrap's
  absence cleanup at the end.
- `src/attachments.rs` — image uploads and fetches after the cycle's rounds: the one check after a restore of the
  images the server lacks, retries and waits, early stops, and the event
  that tells the host which images arrived.
- `src/client.rs` — CBOR and zstd bodies, the reply envelope, the skew estimate, retries, the server URL rule, and the
  epoch and the schemas this app writes, both of which every device call names.
- `src/transport.rs` — `Transport`, one request and its raw reply, and the events socket; `HttpTransport` sends both
  with reqwest.
- `src/error.rs` — `SyncError`.

- `tests/engine/` — one test binary; `common.rs` calls `koloda-server`'s router in process through a `Transport`,
  on a server clock offset from system time; its backup and restore swap the router every device calls.
  Events sockets run over an in-memory pipe, and only once a test serves them.

### Does NOT own (prevent scope creep)

- Sync tables, capture, apply, backfill, join, and repair — `koloda`
- Envelope encoding and endpoint bodies — `koloda-sync-proto`
- What the server stores and decides — `koloda-server`
- Commands, settings screens, and the join wizard — the native hosts

## Read next

- `crates/koloda-sync-proto/PROTOCOL.md` — the contract the engine follows
- `crates/koloda/README.md` — the sync functions the engine calls
- `agents/TESTING.md` — engine behavior is pinned by tests against the real server
