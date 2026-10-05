# koloda-server

The self-hosted sync server: one envelope log per space, device enrollment, push, pull, and bootstrap.
A crate with a binary, not an app: it has no product surface, so `docs/decisions/APP-ROLES.md` has no row for it.
It links `koloda-sync-proto` only, never `koloda`.

## Where it sits

Native devices sync through it; the web host never does.
The contract is `crates/koloda-sync-proto/PROTOCOL.md`; change it in the same commit as the behavior it describes.
Endpoint bodies live in that crate's `transport.rs`, so the sync engine shares them.
The server reads envelope headers and never decodes a payload.

## Running

```bash
koloda-server init --data-dir ./data
```

```bash
koloda-server serve --data-dir ./data --listen 127.0.0.1:8080
```

`init` prints the setup token once; only its hash is stored.
`serve` speaks plain HTTP, so put a TLS reverse proxy in front of it.

## Data directory

| Path | Holds |
| --- | --- |
| `CURRENT` | The active generation's id |
| `generations/<id>/server.db` | Setup token hash, spaces, devices |
| `generations/<id>/spaces/<space>.db` | One space: epoch, `write_schema`, and its envelope log |
| `lock` | Held by `serve` for its whole run |

## Architectural Map

- `src/main.rs` — command line: `init` and `serve`.
- `src/lib.rs` — the route table.
- `src/clock.rs` — server time, injected so tests run on a manual clock.
- `src/data_dir.rs` — layout, `init`, and the directory lock.
- `src/db.rs` — connections and the two migration series under `src/migrations/`.
- `src/server.rs` — shared state: `server.db`, open space databases, and the clock.
- `src/http.rs` — CBOR and zstd bodies, their limits, the reply envelope, and `meta`.
- `src/auth.rs` — setup and device tokens.
- `src/spaces.rs` — space creation, which enrolls the creator, and the list.
- `src/pairing.rs` — pairing codes: issue, preview, claim, and the limits on wrong codes.
- `src/push.rs` — push batches and receipts; one transaction under the space writer lock.
- `src/log.rs` — a space's envelope log: versions at lane seqs, heads, compaction on write, deletes that fence
  and cascade, and receipts.
- `src/pull.rs` — pull pages per lane, cut by entry count and bytes, and the cursors they record.
- `src/known.rs` — the join probe: which ids the space holds live or fenced.
- `src/devices.rs` — device records.

- `tests/server/` — one test binary; `common.rs` drives the router in-process on a manual clock.

### Does NOT own (prevent scope creep)

- Envelope encoding, the kind registry, and endpoint bodies — `koloda-sync-proto`
- Merge, apply, and repair — each device's persistence layer (`koloda`)
- The sync cycle, retries, and recovery decisions — the sync engine

## Read next

- `crates/koloda-sync-proto/PROTOCOL.md` — the contract this crate serves
- `agents/TESTING.md` — server behavior is pinned by in-process tests
