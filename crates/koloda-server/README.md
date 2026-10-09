# koloda-server

The self-hosted sync server: one envelope log per space, device enrollment, push, pull, bootstrap, and attachments.
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
koloda-server serve --data-dir ./data --tls-cert ./tls/fullchain.pem --tls-key ./tls/privkey.pem
```

```bash
koloda-server serve --data-dir ./data --insecure-http
```

```bash
koloda-server backup --data-dir ./data ./backups/2026-10-07
```

```bash
koloda-server restore --data-dir ./data ./backups/2026-10-07 [--authoritative] [--rotate-tokens] [--yes]
```

`init` prints the setup token once; only its hash is stored.
`serve` needs one of two transports, since devices accept plain HTTP only to their own machine.
With `--tls-cert` and `--tls-key` it speaks HTTPS, on `0.0.0.0:8443` unless `--listen` says otherwise.
It reads both files again every 10 minutes and presents a changed pair from the next connection on.
A pair that does not load keeps the old one, so a certbot renewal needs no restart: point the flags at
`/etc/letsencrypt/live/<domain>/fullchain.pem` and `privkey.pem`.
With `--insecure-http` it speaks plain HTTP, on `127.0.0.1:8080` unless `--listen` names another address.
That is for a TLS reverse proxy in front of it, or for `tailscale serve --bg 8080`.
A proxy must pass WebSocket upgrades on `/v1/spaces/{space}/events`, which tells devices when to sync.
Below `--min-free-disk` free bytes (1 GiB by default) it holds growing writes as if every space were over its quota,
and below `--reserve-disk` (64 MiB) it refuses every push; on a platform without `statvfs` both are off.
A request that runs out of disk anyway is refused with `507` and consumes nothing.
It runs a garbage collection pass every hour, over tombstones every active device has passed and attachments no card
has linked for 90 days; `Server::collect_garbage` runs one on demand.
`backup` copies the active generation while `serve` runs, into a directory that is missing or empty.
Each database is copied in one read transaction, `server.db` last; the attachment bytes follow each space's copy.
`manifest.json` is written last, with each file's SHA-256 and each space's epoch, lane heads, senders' last seqs,
and attachment ids.
```bash
koloda-server spaces --data-dir ./data
koloda-server pair --data-dir ./data <space>
```

```bash
koloda-server quota --data-dir ./data <space> <bytes|none>
koloda-server drop-envelope --data-dir ./data <space> <lane> <seq> [--yes]
koloda-server write-schema --data-dir ./data <space> <kind> <schema>
```

`spaces` lists each space with its device count, and `pair` prints a pairing code for a space, as the setup token
issues one; both run beside `serve`, since access to the data directory is the authority.
`quota` sets a space's size quota beside `serve`; over it, devices' growing writes wait (`PROTOCOL.md` §Quotas).
`drop-envelope` runs beside `serve` too: it removes one damaged envelope that devices hold at, as their status
reports it, and asks first unless `--yes`.
A dropped create or tombstone becomes a tombstone the server authors, so every device ends with the entity deleted.
`write-schema` runs beside `serve` too: it raises a kind's `write_schema` by exactly one version.
It refuses while an active device has not advertised that version in its `koloda-schemas` header (`PROTOCOL.md`
§Schema versions).
`restore` needs `serve` stopped: it takes the directory lock, also on a machine with no server yet.
It copies the backup into a new generation and checks every copied file against the manifest.
Each space gets a fresh epoch and a restore point; the old generation's newer points and revocations carry forward.
It lists the restored devices and asks before it moves `CURRENT`, unless `--yes`.
The replaced generation stays on disk; delete old generations by hand.

## Docker

`Dockerfile` builds a static binary into a distroless image that runs as a user that is not root.
Build it from the repository root, since Cargo reads every workspace member's manifest:

```bash
docker build -f crates/koloda-server/Dockerfile -t koloda-server .
```

The image serves plain HTTP on port 8080, with its data directory in the `/data` volume, for a TLS proxy in front.
`deploy/compose.example.yaml` puts Caddy in front, which obtains and renews a certificate for `DOMAIN` on its own:

```bash
cd crates/koloda-server/deploy
export DOMAIN=sync.example.com
docker compose -f compose.example.yaml run --rm koloda-server init --data-dir /data
docker compose -f compose.example.yaml up -d
```

The other commands run the same way, as `docker compose -f compose.example.yaml run --rm koloda-server <command>`.
All but `restore` run beside the server; stop it first with `docker compose -f compose.example.yaml stop koloda-server`.
A backup needs a directory the image's user can write, or runs as root:

```bash
docker compose -f compose.example.yaml run --rm --user root -v "$PWD/backups:/backups" koloda-server \
  backup --data-dir /data /backups/2026-10-08
```

A bind mount in place of the volume must be writable by uid 65532, the image's user.
The `Docker` workflow builds the image and checks that it serves, on branch pushes that touch the server.
No image is published to a registry.

## Data directory

| Path | Holds |
| --- | --- |
| `CURRENT` | The active generation's id |
| `generations/<id>/server.db` | Setup token hash, spaces and their quotas, devices |
| `generations/<id>/spaces/<space>.db` | One space: epoch, restore points, `write_schema`, its envelope log, and attachment metadata |
| `generations/<id>/attachments/<space>/<attachment>` | One attachment's bytes, named by their SHA-256 |
| `lock` | Held by `serve` for its whole run |

## Architectural Map

- `src/main.rs` — command line: `init`, `serve` over TLS or plain HTTP, `backup`, `restore`, `spaces`, `pair`,
  `quota`, `drop-envelope`, and `write-schema`.
- `src/lib.rs` — the route table.
- `src/clock.rs` — server time, injected so tests run on a manual clock.
- `src/data_dir.rs` — layout, `init`, and the directory lock.
- `src/backup.rs` — an online copy of the active generation and its manifest.
- `src/restore.rs` — a backup staged as a new generation: epochs, restore points, carried-forward revocations, and
  the swap of `CURRENT`; and the restore points after a device's epoch, combined as one.
- `src/db.rs` — connections and the two migration series under `src/migrations/`.
- `src/server.rs` — shared state: `server.db`, open space databases and their lane heads, the clock, and the
  operator's write-schema raise.
- `src/tls.rs` — certificates read from PEM files and read again when they change, and a listener that runs each
  TLS handshake off its accept loop.
- `src/http.rs` — CBOR and zstd bodies, their limits, the reply envelope, and `meta`.
- `src/auth.rs` — setup and device tokens, marking a device stale when it calls after a long absence, refusing a
  device call on another epoch with the restore it must apply, and storing the schemas a device advertises.
- `src/spaces.rs` — space creation, which enrolls the creator, and the list.
- `src/pairing.rs` — pairing codes: issue, preview, claim, and the limits on wrong codes.
- `src/push.rs` — push batches and receipts; one transaction under the space writer lock.
- `src/quota.rs` — space quotas, the disk watermarks and the free space they read, and how much room a space has.
- `src/log.rs` — a space's envelope log: versions at lane seqs, heads, compaction on write, deletes that fence
  and cascade, tombstone collection and the GC horizon, and receipts.
- `src/events.rs` — the events socket: the lane heads to each device's one socket, which a newer socket of the
  device or its revocation closes.
- `src/pull.rs` — pull pages per lane, cut by entry count and bytes, and the cursors they record.
- `src/bootstrap.rs` — snapshot leases: open, stream pages, heartbeat, release, and expiry.
- `src/known.rs` — the join probe: which ids the space holds live or fenced.
- `src/drop_envelope.rs` — dropping one damaged version from a space's log, and the tombstone the server authors in
  place of a dropped create or tombstone.
- `src/devices.rs` — device records, revocation and detach, fork, and which devices are active.
- `src/attachments.rs` — attachment bytes by content address: upload checked against the id, download, the ids
  cards link that no device uploaded, card refs,
  and collection of attachments unlinked for 90 days.

- `tests/server/` — one test binary; `common.rs` drives the router in-process on a manual clock, and sends each
  device call with its space's current epoch and this crate's schemas unless a test names others.
- `Dockerfile` — the server image; `deploy/compose.example.yaml` — the image behind Caddy.

### Does NOT own (prevent scope creep)

- Envelope encoding, the kind registry, and endpoint bodies — `koloda-sync-proto`
- Merge, apply, and repair — each device's persistence layer (`koloda`)
- The sync cycle, retries, and recovery decisions — the sync engine

## Read next

- `crates/koloda-sync-proto/PROTOCOL.md` — the contract this crate serves
- `agents/TESTING.md` — server behavior is pinned by in-process tests
