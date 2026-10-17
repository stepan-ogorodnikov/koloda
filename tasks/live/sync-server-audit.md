# Sync server audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, crates/koloda-server/README.md, crates/koloda-sync-proto/PROTOCOL.md, agents/TESTING.md, agents/CODE-DOCUMENTATION.md, agents/BACKWARDS-COMPATIBILITY.md, agents/MARKDOWN.md, agents/VERIFY.md, agents/REVIEW.md
Flow: local

## Intent

Settle every finding of the audit of the sync server (`crates/koloda-server`) at `447056b5` (`main`).
Its report was `tmp/audits/sync-server.md`, which git ignores.
This file restates every finding and its evidence, so neither the next session nor the archive reader needs it.
The audit ran `cargo test -p koloda-server`: 1 unit and 124 integration tests passed.
It also read query plans and timed a pull scan on a scratch space database with 2M `cold` versions.
Its verdict: the server follows `PROTOCOL.md` closely on push, fences, compaction, GC, restore, epochs, and quotas.
The heads indexes of the first audit hold, and the tests drive the real router on a manual clock.
No finding is Must-fix.
The three Should-fix findings sit where a creation retry meets the replay window, where the protocol text describes
deletes the server does not run, and where Docker stops the server.

Done when:

- a space creation retried after its reply was lost, however late, returns the space it created;
- a refused creation leaves no space file on the server;
- `docker compose stop` stops the server at once, after the requests in flight;
- `PROTOCOL.md` describes the delete cascade, the tables, and the lease caps the server has;
- `bun run check:push` is green.

## Scope

Findings, numbered as in the report.
Line numbers are at `447056b5`.

- 1. Spec violation, Should-fix: a creation retried after the replay window, when its first attempt landed, is
  refused for good and leaves an orphan space file each time.
  Decision: fix by item 1.
  - `spaces.rs:44` deletes expired `space_creations` rows first, so `spaces.rs:47` finds no record of a nonce older
    than 10 minutes.
  - `spaces.rs:56` then creates `spaces/<new id>.db` and adds it to the open-space map (`server.rs:100-118`).
  - `spaces.rs:96-107` hits the `token_hash UNIQUE` constraint (`migrations/server/V1__server.sql:17`), since the
    landed attempt enrolled that token, and `spaces.rs:72` answers `bad_request` "the token is already enrolled".
    The file and its two open connections stay.
  - The engine resends the stored nonce and token on every attempt and keeps them on any refusal
    (`crates/koloda-sync/src/engine.rs:581-588`).
    So the file never creates a space until the user joins with a code, and each try adds one more orphan file.
  - `PROTOCOL.md:946-950` (§Bodies) says that past 10 minutes the server forgets the nonce "and they create a new
    space".
  - `tests/server/spaces_tests.rs` replays only within the window.
- 2. Spec violation, Should-fix: `PROTOCOL.md` describes server deletion scopes and chunked cleanup that do not exist.
  Decision: fix by item 3.
  - `PROTOCOL.md:82-83` lists `deletion_scopes` that pulls, snapshots, and head installation treat as absent.
  - `:510-511` and `:517` (§Cascades by ancestry and header refs) say the server commits a scope, then
    chunk-removes heads.
  - `:876` (§Endpoints) says pull returns envelopes "minus anything under a committed deletion scope".
  - `:1275-1278` (§Bootstrap) takes snapshots "after every committed deletion scope", and "chunk cleanup" cannot
    remove pinned versions.
  - The server removes every card and review head of a deleted deck or template, and fences the cards, in the push
    transaction (`log.rs:108-131`); no table holds a scope.
  - The first audit's P3 was triaged as "already 'may later' in `PROTOCOL.md`" (`tasks/archive/sync-audit-fixes.md:99`).
    That sentence (`PROTOCOL.md:464-466`) is about the device's `sync_delete_jobs`, not the server.
  - `§Quotas` (`:1097`) already assumes the one-transaction delete.
- 3. Spec violation, Later: §Topology's list of server state and §Bootstrap's pinned-bytes cap disagree with the code.
  Decision: fix by item 3, which edits the same sections.
  - `PROTOCOL.md:74-90` names `entry_versions`, `entry_heads`, `tombstones`, `snapshots` / `snapshot_items`, and
    `sender_progress` / `sender_receipts`.
  - The space schema has `versions`, `heads`, `leases` / `lease_items`, and `senders` / `receipts`
    (`migrations/space/V1__space.sql`).
    A tombstone is a head in group `''` (`log.rs:18-19`).
    `sender_holds`, `lanes`, `live_entities`, and `attachments` go unlisted.
  - `PROTOCOL.md:1282` says space-wide caps limit concurrent leases "and pinned bytes".
    `bootstrap.rs:200-207` caps only the count; pinned versions count toward the quota only as pages.
- 4. Spec violation, Later: count caps answer `too_large`, and the missing-ids list clamps its `limit`.
  Decision: skipped as Later (Open questions 1).
  - §Errors gives `too_large` to "a body past its size or expansion cap" and `bad_request` to "a value out of range"
    (`PROTOCOL.md:991`, `:1003`).
  - A push over 5,000 items and a probe over 1,000 ids answer `too_large` (`push.rs:230-234`, `known.rs:27-31`).
  - `attachments.rs:86` clamps `limit` into 1 to 1,000, while pull and bootstrap pages refuse it (`pull.rs:46-49`).
  - Fix direction: name the count caps under `too_large`, or answer `bad_request`; refuse an out-of-range `limit`.
- 5. Risk, Should-fix: in the Docker image `serve` ignores SIGTERM, so every stop waits 10 seconds and ends in SIGKILL.
  Decision: fix by item 2.
  - `main.rs:414-418` waits only for `tokio::signal::ctrl_c()`, and the graceful shutdown at `main.rs:374` and
    `:379` waits on it.
  - The image runs the binary as PID 1 (`Dockerfile:21-23`), and the compose example sets no `init`
    (`deploy/compose.example.yaml:10-17`).
    Linux ignores a signal to a namespace's PID 1 that installed no handler, so Docker waits out its grace period.
  - An in-flight request is cut; SQLite rolls it back, but an upload mid-staging leaves its temp file (finding 7).
  - Every restart and upgrade takes 10 seconds, and `README.md:103` has operators stop the container before a
    restore.
    Under systemd, SIGTERM also skips the graceful path.
- 6. Risk, Later: unauthenticated bodies are read into memory, up to 16 MiB plus 16 MiB decompressed, before any check.
  Decision: skipped as Later (Open questions 1).
  - Every body handler awaits `read_body` before `respond` runs auth (`push.rs:51`, `pairing.rs:72`, `:80`,
    `attachments.rs:43`, `spaces.rs` `create`); `read_body` buffers up to `MAX_BODY_BYTES` and decompresses as much
    again (`http.rs:130-143`).
  - Preview and claim take no token, and their real bodies are tiny.
    A few dozen 16 MiB requests exhaust a small VPS; the trust model names resource exhaustion (`PROTOCOL.md:45`).
  - Fix direction: check the bearer token before the body on token endpoints; give preview and claim a small cap.
- 7. Risk, Later: staged attachment files are never removed after a failed write or a stop mid-upload.
  Decision: skipped as Later (Open questions 1).
  - `attachments.rs:154-155` returns early when `write_synced` fails and leaves the partial `.{id}.{uuid}.tmp`; a kill
    between staging and rename leaves one too.
  - Searched `'\.tmp'` in `crates/koloda-server/src`: only this line and `CURRENT.tmp`, so no sweep exists.
  - They count toward no quota (`quota.rs:119-128`), and collection and backup pass them by
    (`attachments.rs:264-283`, `backup.rs:173-198`).
  - Fix direction: remove the staged file on a failed write; sweep each space's `.*.tmp` when `serve` starts.
- 8. Risk, Later: writer transactions are deferred, so a CLI write to a space database can fail a push with `500`.
  Decision: skipped as Later (Open questions 1).
  - Push (`push.rs:93`), bootstrap (`bootstrap.rs:85`, `:98`, `:117`, `:152`, `:187`), upload (`attachments.rs:158`),
    and collection (`server.rs:193`) read before they write.
  - `drop-envelope` and `write-schema` write the same files from another process.
    In WAL mode the upgrade then fails `SQLITE_BUSY_SNAPSHOT`, which the busy timeout does not retry, and surfaces as
    `internal` (`http.rs:115-128`).
    `drop_envelope.rs:79-81` documents this race and opens `Immediate`.
  - Fix direction: open the space writer's transactions `Immediate`; the writer mutex already serializes them.
- 9. Risk, Later: a pull scans every one of the caller's own entries up to the bound, holding the space's only reader.
  Decision: skipped as Later (Open questions 1).
  - `pull.rs:97-100` skips own entries without counting them toward the entry or byte cap.
  - On the scratch database, 2M own `cold` entries took 1.6 s on a warm cache to answer an empty page, through the
    indexed plan (`SEARCH v USING INDEX …`, `SEARCH h USING COVERING INDEX heads_version`).
  - The space has one reader connection (`server.rs:40`), which `meta` of every device call also takes
    (`http.rs:308`).
    After an import of tens of millions of reviews, the importer's next `cold` pull holds the space's reads for tens of
    seconds; the engine's request timeout is 120 s (`crates/koloda-sync/src/transport.rs:29`).
  - Fix direction: stop a page after a fixed number of scanned rows, with `scanned_through` at the last one and
    `has_more` (`PROTOCOL.md:698-699` already allows it).
- 10. Risk (tests), Later: the staleness and attachment-collection windows are not tested at their limits.
  Decision: skipped as Later (Open questions 1).
  - `stale_tests.rs:70-81` checks 89 days, then 91 more; `:167-178` checks 23 hours, then 25 more.
    `attachments_tests.rs:386-409` checks 89 and 91 days.
  - The rules are `now - last_seen > window` (`devices.rs:293`) and `unlinked_since < now - 90 days`
    (`attachments.rs:271`); a slip to `>=` or `<=` passes every test.
  - `agents/TESTING.md` (§Write tests for): test at the limit and one past it, as the lease TTL and `last_seen` tests
    do (`bootstrap_tests.rs:226-251`, `devices_tests.rs:88-106`).
- 11. Risk (tests), Later: no test pins the events socket's close after 60 silent seconds.
  Decision: skipped as Later (Open questions 1).
  - `events.rs:155-161` pings every 30 s and closes after 60 s without a ping or pong (`PROTOCOL.md:970`).
  - Searched `ping|silent|pause|advance` in `events_tests.rs`: only a match arm that skips control frames.
  - Fix direction: a test under `tokio::time::pause()` that answers no ping and sees the close.
- 12. Improvement, Later: a cascade removes each review with two statements it prepares again each time.
  Decision: skipped as Later (Open questions 1).
  - `log.rs:114-122` calls `remove` per review; `remove` (`log.rs:435-451`) builds its `DELETE` with `format!` and runs
    it through `tx.execute`, which prepares on every call.
  - A 20M-review deck delete prepares about 40M statements in the one push transaction P3 accepted; not measured.
  - Fix direction: one set-based statement per card for `versions` and `heads`, or `prepare_cached`.
- 13. Improvement, Later: the missing-ids list restarts its index scan from the first id on every page.
  Decision: skipped as Later (Open questions 1).
  - `attachments.rs:90-97` filters with `(?1 IS NULL OR r.attachment > ?1)`, and the plan reads
    `SCAN r USING COVERING INDEX attachment_refs_attachment`, so page *n* reads every ref before it.
  - The list runs once after a restore and pages only past 1,000 missing ids.
  - Fix direction: bind `''` when `after` is absent and filter `r.attachment > ?1`.
- 14. Product decision, Later: behind the documented proxy, the per-address pairing limit is one bucket for everyone.
  Decision: accepted for v1, and documented by item 3 (Open questions 3).
  - Wrong codes are counted by the TCP peer (`pairing.rs:232-236`); the image serves plain HTTP behind Caddy
    (`Dockerfile:23`, `deploy/compose.example.yaml:23`), and the README also suggests `tailscale serve`.
  - Every request then comes from the proxy, so 10 wrong codes a minute from anyone block pairing for everyone.
    `PROTOCOL.md` §Pairing intends 10 per address and 100 server-wide.
  - Options: accept it for v1 and say so in §Pairing and the README, or trust a forwarded address under a `serve` flag.

In:

- `koloda-server`: space creation (`spaces.rs`), `serve`'s shutdown (`main.rs`), and their tests.
- `crates/koloda-sync-proto/PROTOCOL.md`: §Topology and server state, §Cascades by ancestry and header refs, the
  pull row of §Endpoints, §Bodies, §Bootstrap, and §Pairing, each with the item that makes it true.
- `crates/koloda-server/README.md` `Running`: the shutdown signals (item 2) and the pairing limit behind a proxy
  (item 3).

Out:

- Findings 4 and 6 to 13, as Later (Open questions 1).
- Counting wrong pairing codes by a forwarded client address (finding 14, Open questions 3).
- The engine: it already resends the nonce and token the fix relies on.
- Chunked server deletes: the cascade stays one push transaction, as P3 accepted.

## Open questions

- [x] 1. Triage? — as proposed (human, 2026-10-17).
  Fix 1, 2, and 5, and 3 with 2 since it edits the same sections; 4 and 6 to 13 stay Later and are not scheduled.
- [x] 2. How does a late creation retry find its space? — as proposed (human, 2026-10-17).
  When the nonce is unknown and the token already names a device, answer that
  device's enrollment.
  It covers a restore too, which drops every creation row (`restore.rs:277`).
  The other way is to keep `space_creations` rows for good, which a restore still drops; it also changes the engine's
  comment at `engine.rs:582-584` and needs a migration to drop `expires_at`.
- [x] 3. Finding 14: accept one pairing bucket behind a proxy for v1, or trust a forwarded address under a flag? —
  accept it for v1 (human, 2026-10-17).
  §Pairing and the README `Running` section say so.
  The note rides with item 3, the docs-only item, rather than item 2 as first proposed, so item 2 stays one concern.
- [x] 4. Flow? — `local` (human, 2026-10-17).

## Plan

- [x] 1. Answer a late space-creation retry with the space it created
  Goal (finding 1):
  - In `create_space` (`spaces.rs`), when `same_creation` finds no record for the nonce, look up the device whose
    `token_hash` the request's token hashes to, before anything is written.
    - Found: answer its enrollment, the device's space id and id with that space's current epoch, and write nothing.
      A revoked device is answered too; its first device call then gets `401 revoked`.
    - Not found: create the space as today.
  - So a refused or answered creation never reaches `create_space_db`, and no space file is made for it.
  - The race fallback at `spaces.rs:72` stays for two requests that insert the same nonce at once.
  - `PROTOCOL.md` §Bodies (lines 946-950): past 10 minutes the server answers from the device the token enrolled, so a
    landed creation returns its space; one that never landed creates it then.
    `A different token for that nonce is bad_request` still holds inside the window.
  - Trap comment: an `INVARIANT` that the token is the proof, since the engine resends one nonce and token until it
    records the enrollment.
  Constraints:
  - `spaces.rs` and `PROTOCOL.md` only; no migration, no engine change.
  - The existing replay and other-token tests keep their assertions.
  Done when:
  - A new test in `spaces_tests.rs`: create a space, advance the clock past `REPLAY_WINDOW_MS`, and send the same
    request again; it returns the first enrollment, `GET /v1/spaces` lists one space, and `spaces/` holds one file.
  - The test fails against today's `spaces.rs`, checked once by hand.
  - `cargo test -p koloda-server` and `cargo test -p koloda-sync` pass, and `bun run check:push` is green.
  Manual verify: none — a lost reply plus a 10-minute wait, which only the test arranges.
  Commit: Answer a late space-creation retry with the space it created
  Depends on: none

- [ ] 2. Stop the sync server on SIGTERM as on Ctrl+C
  Goal (finding 5):
  - `shutdown()` (`main.rs:414-418`) resolves on Ctrl+C or, on Unix, on SIGTERM
    (`tokio::signal::unix::signal(SignalKind::terminate())`), so `with_graceful_shutdown` drains in both cases.
  - A failure to listen for a signal is reported and stops the server, as a Ctrl+C failure does today.
  - `README.md` `Running`: `serve` stops on Ctrl+C or SIGTERM and finishes the requests in flight, so
    `docker compose stop` needs no grace period.
  Constraints:
  - `main.rs` and the README only; the `Dockerfile` and the compose example stay as they are.
  - No new dependency: `tokio`'s `signal` feature is already on (`Cargo.toml:32`).
  Done when:
  - A new `#[cfg(unix)]` test next to `serve_needs_exactly_one_of_tls_and_plain_http` (`tls_tests.rs`) runs the binary
    with `serve --insecure-http --listen 127.0.0.1:0` on an initialized data directory, reads its `listening on`
    line, sends SIGTERM with `kill -TERM`, and sees it exit with success.
  - The test fails against today's `main.rs` (the process dies of the signal), checked once by hand.
  - `cargo test -p koloda-server` passes, and `bun run check:push` is green.
  Manual verify:
  - Host: the Docker image, from `crates/koloda-server/deploy`.
  - `docker compose -f compose.example.yaml up -d`, then `docker compose -f compose.example.yaml stop koloda-server`
    → it returns at once, and `docker compose ps -a` shows exit code 0, not 137.
  Commit: Stop the sync server on SIGTERM as on Ctrl+C
  Depends on: none

- [ ] 3. Describe the server's deletes, tables, and limits as they are
  Goal (findings 2, 3, and 14):
  - §Topology and server state (`PROTOCOL.md:72-90`): list the space database's tables under their names:
    `space` (the epoch and the byte counters), `write_schema`, `lanes`, `versions`, `heads` (a tombstone is the
    entity's head in the empty group), `deleted_ids`, `senders`, `receipts`, `sender_holds`, `leases` and
    `lease_items`, the restore points, `attachments`, `attachment_refs`, and `live_entities`.
    Drop `deletion_scopes`.
  - §Cascades by ancestry and header refs (lines 509-517): a deck or template delete removes the descendant heads and
    fences the cards in the push transaction that applies the tombstone.
    Chunked server deletes stay a named later option beside the device's (lines 464-466).
  - §Endpoints, the pull row (line 876): drop "minus anything under a committed deletion scope".
  - §Bootstrap (lines 1275-1278 and 1282): the lease lists the live heads; drop the deletion scopes and chunk cleanup;
    the space-wide cap is on leases, and pinned versions count toward the quota as the pages they use.
  - §Pairing, the `Failures` bullet (lines 1662-1665): wrong codes are counted by the connection's address.
    Behind a reverse proxy every client shares the proxy's, so the per-address limit then acts as one server-wide
    limit of 10 a minute; v1 accepts that.
  - `README.md` `Running`, after the proxy paragraph (lines 42-47): the same note, for the operator.
  Constraints:
  - Docs only: `PROTOCOL.md` and the server `README.md`.
  - The `README.md` §Data directory table already matches the code; keep the two consistent.
  Done when: `bun run check:push` is green.
  Manual verify: none — docs only.
  Commit: Describe the server's deletes, tables, and limits as they are
  Depends on: none

## Outcome

<what shipped>
