# Sync transport and deployment

Status: ready

## Intent

Make the sync server safe to expose and easy to run, and let devices learn about changes as they happen.
Today a device learns about another device's write only on its 60-second poll.
`serve` speaks plain HTTP only, and the repo describes no proxy, image, or compose file.
A joining device starts a bootstrap its disk may not hold, and the engine cannot tell a metered network from any
other.
`crates/koloda-sync-proto/PROTOCOL.md` §Wire, §Endpoints, §Cycle, §Bootstrap, and §Metered networks describe the
rules; this task builds them.

Done when:

- a grade on one device reaches another live device within a few seconds, with no poll;
- a device whose socket cannot connect, as behind a proxy without WebSocket upgrades, still syncs every 60 seconds;
- `koloda-server serve` speaks HTTPS from certificate files and picks up renewed ones without a restart;
- it speaks plain HTTP only with `--insecure-http`, and then on loopback unless `--listen` names another address;
- an operator can run the server from the repo's Dockerfile and compose example;
- a device whose disk cannot hold a bootstrap stops before streaming and reports how much room it needs;
- on a metered network a device keeps incremental sync running and pauses bulk transfers above the host's limit;
  it reports the estimate and continues when the host allows it;
- `bun run check:push` is green and runs the new tests.

## Scope

In:

- `koloda-sync-proto`: the nudge body, and the `PROTOCOL.md` sections each item makes true.
- `koloda-server`:
  - the events WebSocket and a per-space channel of lane heads;
  - TLS from certificate files with reload, and `--insecure-http`;
  - a Dockerfile, `.dockerignore`, and a compose example (question 5).
- `koloda-sync`:
  - the events socket in `Transport` and `HttpTransport`;
  - the runner's nudges and poll intervals;
  - the free-disk preflight;
  - the network policy, the metered pauses, their status, and the call that lifts them.
- `koloda`: the database file's path, which the preflight reads.
- The READMEs and `agents/RUST.md`, each with the item that makes them true.

Out:

- Built-in ACME (question 4).
- Publishing the image to a registry (question 5).
- Device policy for image downloads (always, on unmetered networks, on demand) and its UI: the mobile phase.
- Detecting a metered network on desktop: the host passes it in; the desktop UI task decides how.
- Chunked deletes.
- The three `sync-holds` follow-ups and the recovery follow-up about a `fixed` cohort stamped ahead.
- NAPI `cmd_sync_*`, Settings → Sync, the join wizard, and a product spec for sync (the desktop UI task, which lands
  last).
- The web host, which does not sync, and mobile.

## Open questions

The owner took every recommendation on 2026-10-08.

- [x] 1. Area guides?
  Answer: `agents/TASKS.md`, `agents/IMPLEMENTATION-PLAN.md`, `agents/MARKDOWN.md`,
  `agents/CODE-DOCUMENTATION.md`, `agents/CODE-STYLE.md`, `agents/TESTING.md`, `agents/RUST.md`,
  `agents/BACKWARDS-COMPATIBILITY.md` (the `serve` flags change), `agents/VERIFY.md` (the manual Docker check), and
  `agents/REVIEW.md` for self-review.
  Also `crates/koloda/README.md`, `crates/koloda-sync/README.md`, `crates/koloda-server/README.md`,
  `crates/koloda-sync-proto/PROTOCOL.md` and its README, and `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`.
  `agents/DB.md` is left out: no item adds a migration.
  No guide covers Dockerfiles or `.github/workflows`.
- [x] 2. One task, or two?
  Answer: one task, in plan order.
  The socket comes first: a minute's delay is the gap users notice most, and it is the riskiest change to the runner.
  The alternative splits the engine-only preflight and metered pauses into a second task.
- [x] 3. How often does a device poll once the socket exists?
  Answer: every 5 minutes while the socket is up, and every 60 seconds, as today, while it is down.
  - The poll while up covers `drop-envelope`, which runs in another process and nudges nobody.
  - Polling every 60 seconds while down means a proxy without WebSocket upgrades costs at most a minute.
  - Losing the socket starts a cycle, so polling falls back to 60 seconds at once.
  The proposal's text polls only while the socket is down, every few minutes.
- [x] 4. Built-in ACME?
  Answer: not in this task.
  - Certificate files and `--insecure-http` cover certbot, a reverse proxy, and `tailscale serve`.
  - The compose example puts Caddy in front, which obtains and renews certificates itself.
  - ACME cannot be tested without a public domain.
  If yes: one more item after TLS, with `--acme-domain` and `--acme-email`, TLS-ALPN-01 through `rustls-acme`, a
  certificate cache under `<data-dir>/acme`, and a manual check against Let's Encrypt staging.
- [x] 5. What ships for Docker, and what checks it?
  Answer:
  - a multi-stage Dockerfile that builds a static musl binary into a non-root distroless image with a `/data`
    volume;
  - a root `.dockerignore`;
  - a compose example with Caddy in front;
  - a new CI job `docker` that builds the image on branch pushes that touch the server, outside the required
    `checks`.
  No image goes to a registry until the server has a release process.
  This machine has no Docker, so that job and your own run are the only checks.
- [x] 6. On a metered network, what counts as bulk, and how is it measured?
  `PROTOCOL.md` says bulk transfers above the limit pause and tiny incremental sync never does, but not how a
  transfer's size is known before it runs.
  Answer:
  - The host sets `Network { is_metered }` (a low-data mode counts as metered) and the limit, 20 MB by default.
    A new engine starts unmetered.
  - A `hot` pull, and a push while the outbox holds less than the limit, always run.
  - Checked before they start, from an estimate:
    - a bootstrap or re-bootstrap, by the lease's `bytes`; above the limit it releases the lease and pauses;
    - a push while the outbox holds more than the limit, as after a large local import, by the outbox's bytes.
  - Counted as they run, since their size is not known up front: backfill and heal top-ups, `cold` pulls, and image
    transfers share one allowance of the limit per metered network, and stop once it is spent.
    A device that only grades and edits never spends it.
  - `Status.metered` shows the pause and the estimate when there is one.
    `Engine::allow_metered()` lifts every pause until the host reports another network, and starts a cycle.
  The alternative estimates every bulk job up front.
  That needs a size estimate for the backfill left and a byte count per lane from the server.

## Plan

- [x] 1. Serve the events WebSocket
  Goal:
  - `GET /v1/spaces/{space}/events` upgrades to a WebSocket.
    The upgrade is a device call: the token, `koloda-epoch`, and `koloda-schemas` are checked as for any other, and a
    refusal is an ordinary `{ meta, error }` reply.
  - Each open space keeps a channel of its lane heads, moved after every push that raises a head.
    `drop-envelope` runs in another process and moves none; the poll covers it (question 3).
  - After the upgrade the server sends the current heads, then the new heads on every change, as binary CBOR
    `Heads { head_hot, head_cold }` from `transport.rs`.
    It sends to every socket of the space, the pusher's included.
  - One socket per device: a new one closes the device's older one.
    Revoking or detaching a device closes its socket.
  - The server pings every 30 seconds and closes a socket that has not answered for 60.
    It reads nothing else from the device, and closes a socket that sends data.
  - `PROTOCOL.md` §Endpoints gains the rules above; the server README says a proxy must pass WebSocket upgrades.
  Constraints:
  - axum's `ws` feature; no change to any other endpoint's reply.
  - The heads channel never holds the space writer lock.
  Done when: server tests over a loopback listener cover:
  - the first message carries the current heads, and a push from another device sends the new ones;
  - an upgrade with a wrong token, a revoked device, or another epoch is refused with its usual error;
  - a second socket for the same device closes the first;
  - revoking the device closes its socket;
  - `bun run check:push` green.
  Commit: Serve the events WebSocket with each space's lane heads
  Depends on: none

- [x] 2. Sync on nudges from the events socket
  Goal:
  - `Transport` gains an events call that opens the socket and yields `Heads` as they arrive.
    `HttpTransport` upgrades through reqwest, so the socket uses the same TLS and server URL rule as every call.
  - The runner keeps one socket open while the file is enrolled, attached, and not waiting for Add or Replace.
    It reconnects after a close or an error with backoff from 1 second, doubling up to 60.
    It drops the socket on detach, and reconnects with the new epoch, token, or device after a restore or fork.
  - Heads above the last ones a reply reported start a cycle, as `nudge` does.
    The device ignores heads it already saw, so its own pushes cost no extra cycle.
  - A refusal of the upgrade starts a cycle, which applies a restore or detaches as for any other call.
  - Polling follows question 3.
  - `PROTOCOL.md` §Cycle drops "Until the nudge socket exists" and states the poll intervals; the engine README says
    so.
  - `tick` opens no socket; mobile can sync by polling alone.
  Constraints:
  - The test transport serves events from the server's heads channel in process; one loopback test drives the real
    endpoint through `HttpTransport`.
  - No test sleeps; the runner's `Timer` drives time.
  Done when: engine tests cover:
  - a push from device A starts a cycle on device B with no poll, and B pulls A's write;
  - a nudge that echoes the device's own push starts no cycle;
  - a refused upgrade backs off and retries;
  - a restore the socket ran into is applied by the cycle it starts, and the socket reconnects on the new epoch;
  - polling is every 5 minutes while the socket is up and every 60 seconds while it is down, per question 3;
  - a loopback test where a grade on one engine reaches the other through the socket;
  - `bun run check:push` green.
  Commit: Sync on nudges from the events socket
  Depends on: 1

- [x] 3. Serve HTTPS from certificate files
  Goal:
  - `serve` takes `--tls-cert` and `--tls-key` (PEM), or `--insecure-http`; it refuses to start with neither or
    both.
  - With TLS, `--listen` defaults to `0.0.0.0:8443`.
    With `--insecure-http`, it defaults to `127.0.0.1:8080`, as today, and any other address must be given.
  - The server re-reads the certificate and key when either file changes, checked every 10 minutes.
    A pair that does not load keeps the old one and logs why.
  - A failed TLS handshake closes that connection only and never stalls accepting others.
  - The server README's Running section shows both modes, certbot, and `tailscale serve`.
  Constraints:
  - rustls with an explicit crypto provider, so linking reqwest in tests cannot make the provider ambiguous.
  - The router and every handler stay as they are.
  Done when: server tests cover:
  - a request over TLS with a certificate made in the test and trusted by the test client;
  - a reload after the files change, and a broken pair keeping the old certificate;
  - `serve` refusing to start with neither mode or both;
  - `bun run check:push` green.
  Commit: Serve HTTPS from certificate files, plain HTTP only on request
  Depends on: none

- [ ] 4. Add a Docker image and a compose example
  Goal: per question 5.
  - The image runs `koloda-server serve --data-dir /data --insecure-http --listen 0.0.0.0:8080`, for use behind the
    compose example's Caddy.
  - `docker compose run --rm koloda-server init --data-dir /data` prints the setup token.
  - The server README gains a Docker section: build, init, the domain variable, and backup from the volume.
  Constraints:
  - The build context is the repo root, since Cargo needs every workspace member's manifest.
  - `.dockerignore` keeps `node_modules`, `target`, `dist`, and `.git` out of the context.
  - The required CI job `checks` is unchanged.
  Done when:
  - the new CI job builds the image on this branch;
  - manual: `docker compose up` with a test domain answers `GET /v1/spaces` with `401` through Caddy over HTTPS;
  - `bun run check:push` green.
  Commit: Add a Docker image and a compose example for the server
  Depends on: 3

- [ ] 5. Check free disk before a bootstrap streams
  Goal:
  - Before streaming, a bootstrap reads the free space on the volume that holds the database file.
    A join bootstrap needs three times the lease's `bytes` plus 64 MiB.
    A re-bootstrap needs the same, less the file's current size, since it mostly rewrites rows the file holds.
  - Short of that, it releases the lease and stops with `SyncError::LowDisk { needed, free }`, shown as
    `Stop::LowDisk`; the next trigger checks again.
  - An in-memory database skips the check.
  - `koloda` exposes the database file's path; the engine reads free space through a cross-platform crate, since
    `rustix`'s `statvfs` has no Windows support.
  - `PROTOCOL.md` §Bootstrap states the rule.
  Constraints: no SQL outside `koloda`; the free-space reader is injected so tests can set it.
  Done when: engine tests cover:
  - a bootstrap refused on a small free space, with its lease released and the status naming both numbers;
  - the same bootstrap running once the space is there;
  - a fixture bootstrap of a few thousand reviews growing the file by less than three times the lease's `bytes`,
    which pins the factor;
  - `bun run check:push` green.
  Commit: Check free disk before a bootstrap streams
  Depends on: none

- [ ] 6. Pause bulk sync on metered networks
  Goal: per question 6.
  - `Engine::set_network`, the limit, `Engine::allow_metered`, and `Status.metered`.
  - `PROTOCOL.md` §Metered networks states which transfers are bulk and how each is measured; the engine README
    says so.
  Constraints: no new endpoint or reply field; the pause never stops a `hot` pull or a push of a small outbox.
  Done when: engine tests cover:
  - on a metered network, a bootstrap above the limit pauses with its estimate and runs after `allow_metered`;
  - a grade pushes and a remote edit pulls while a pause holds;
  - a `cold` backlog and a backfill stop once the allowance is spent;
  - a new network clears both the pause and the allowance;
  - `bun run check:push` green.
  Commit: Pause bulk sync on metered networks
  Depends on: 5

## Outcome

<what shipped>
