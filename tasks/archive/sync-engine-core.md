# Sync engine core

Status: done

## Intent

Build the first slice of `crates/koloda-sync`, the engine that runs sync on native devices against `koloda-server`.
`koloda` already captures, applies, backfills, and joins; the engine makes the server calls that drive them.
It creates and joins spaces, pushes the outbox and settles every outcome, pulls both lanes, runs backfill,
bootstraps from snapshot leases, and manages devices.
Nothing user-visible changes until the NAPI commands and the desktop UI land in the next task.

Done when:

- a test device creates a space, and its rows reach the in-process server, including rows written before enrollment;
- a second device joins by pairing code in every mode except re-attach, bootstraps, and converges with the first;
- every push outcome, a lost reply, and a push refused whole leave the outbox and cohorts as `PROTOCOL.md` says;
- a revoked device detaches, and a file that is behind or a skewed clock stops the cycle with status saying why;
- one test runs the engine over real HTTP on loopback;
- `bun run check:push` is green and runs the engine's lint and tests.

## Scope

In:

- `crates/koloda-sync`: a library crate that links `koloda` and `koloda-sync-proto`, with its nx project wired into
  the checks.
- An HTTP client for the server's endpoints: CBOR bodies with zstd, the reply envelope, error codes, and the skew
  estimate.
- Space creation; pairing issue, preview, and claim; joining as a blank file, an untouched seed, or a used file
  through Add or Replace.
- The cycle:
  - the own device record and the "behind" check;
  - push in batches that never split a cohort, and every push outcome;
  - pull of `hot` to head and `cold` to the recorded head;
  - backfill batches, and dangling-default repair after catch-up;
  - the skew pause.
- Union bootstrap from a snapshot lease, with heartbeats and a restart when the lease lapses.
- Devices: list, revoke, and detach; `401 revoked` detaches the file.
- The host API: an engine that owns its runtime, a background runner with coalesced triggers and polling, status,
  events, and a bounded tick.
- In `koloda`: outbox batches and push settlement, `sync_held`, snapshot apply, and new `sync_state` columns.
- `PROTOCOL.md`, README, decision, and `agents/RUST.md` updates, each with the item that makes it true.

Out:

- Recovery: the fork, re-stamping local cohorts after a fork or a skew pause, renumbering, re-bootstrap with its
  barrier and absence cleanup, re-attach, `cursor_too_old`, and `rebase_required`.
  A file that is behind stops and says so.
- Server restore: `epoch_changed`, heal re-push, the authoritative reset, and restore points.
  The server has no restore yet.
- Corrupt and unknown-schema envelopes beyond stopping the lane: header-only deletes and resets, and the
  `corrupt_envelope` and `update_required` reports.
  Until then a page that fails to decode stops its lane at its cursor.
  A stopped `hot` also stops `cold`, because the cycle pulls `hot` first.
- Regenerating held envelopes, and `held { quota }`.
- Metered-network pauses, network policy, and the free-disk preflight before bootstrap.
- Attachment upload and fetch queues, and `missing_attachments`; the server has no attachment endpoints yet.
- The events WebSocket; the engine polls.
- The per-kind merge hook.
- NAPI `cmd_sync_*`, Settings → Sync, the join wizard, the QR payload, and what the setup hint holds (the desktop UI
  task).
  The engine carries the hint as opaque bytes.
- A product spec for sync; it lands with the desktop UI task.
- Server changes, unless an item finds a server bug; the fix then rides with that item.
- The web host: it does not sync (`docs/decisions/APP-ROLES.md`).
- Mobile: uniffi and background scheduling.

## Open questions

- [x] Area guides? — `agents/TASKS.md`, `agents/IMPLEMENTATION-PLAN.md`, `agents/MARKDOWN.md`,
  `agents/CODE-DOCUMENTATION.md`, `agents/CODE-STYLE.md` (change discipline), `agents/TESTING.md`, `agents/RUST.md`,
  and `agents/DB.md` (the `koloda` changes and the migration).
  Also `crates/koloda/README.md`, `crates/koloda-sync-proto/PROTOCOL.md` and its README,
  `crates/koloda-server/README.md` (the test server), `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` (desktop-only
  sync writes), and `agents/REVIEW.md` for self-review.
- [x] 1. What does this slice include? — everything under Scope In.
  Recovery waits for its own task: fork, re-stamp, re-bootstrap, and re-attach share one barrier and one re-stamp.
- [x] 2. Transport and tests? — a `Transport` trait with one reqwest implementation (rustls, no default features).
  Tests call `koloda_server::router` in process through that trait, with no sockets; `koloda-server` is a dev
  dependency.
  The server clock is system time plus an offset the test moves, because `koloda` stamps with system time.
  One loopback test runs the real reqwest path.
- [x] 3. Runtime and host API shape? — the engine owns a tokio runtime on its own thread, and host calls are blocking
  Rust functions.
  The NAPI binding later runs them on its worker pool, as it runs every command today.
  Database work runs on blocking threads, because `Database` serializes on one mutex.
  Events go to a host sink trait.
- [x] 4. Migrations? — one `V9__sync_engine.sql` that items extend until the task lands, as the server task did with
  its `V1`; nothing outside this branch applies it before then.
- [x] 5. Protocol gaps this task fills? — all of these, each written into `PROTOCOL.md` by the item that implements
  it:
  - `fenced`: the device deletes the entity and its descendants, as an applied tombstone would.
    It fences the id with the rejected envelope's stamp; the tombstone, when pulled, meets that fence.
  - `existence`: the device clears the row and drops the pending write; the local row keeps its value.
    Capturing the missing referent waits for heal re-push, which re-encodes rows from their stored stamps.
  - `dependency_fenced { drop_entity }`: the device deletes the entity and its descendants without publishing.
    The dead parent's or template's tombstone arrives by pull.
  - `dependency_fenced { repair_pointer }`: the device clears the row.
    The referent's tombstone, when pulled, sweeps the pointer.
  - `held`: the row moves to `sync_held` with its reason.
    This app version regenerates nothing, because only a schema bump or quotas can clear a reason.
  - `seq_reused`: push stops and the file reports `behind`; rows the reply did not reach go back out of flight.
  - A push with no complete reply fixes every `uncertain` cohort it carried.
    Its rows stay in flight, and the next push sends the same bytes first.
  - An error reply to a push consumed nothing.
    Its `uncertain` cohorts return to `local` and their rows leave flight; `fixed` cohorts keep theirs in flight.
  - A file that is behind stops pushing and pulling until recovery lands.
    Pulling would miss the original's writes, because pull excludes the device id both files share.
  - The skew estimate is server time minus local time when a reply arrives.
    Push and apply pause while it exceeds 5 minutes either way.
  - Bootstrap on the device runs the `hot` snapshot, `hot` catch-up to a head read after the lease, the `cold`
    snapshot up to the lease's cold head, then incremental `cold` pulls.
    Nothing is pushed until it ends.
    A persisted flag makes a relaunch bootstrap again instead of pulling from 0, and a lapsed lease restarts it.
  - Join previews before it claims, so a file that would re-attach is refused before its code is used.
    A lost claim reply is retried with the same nonce.
  - `401 revoked` detaches the file: the token is deleted, rows and sync tables stay, and the engine sends nothing
    more.
    `detach` revokes the own device first.
  - A server URL is `https`, or `http` to a loopback host.
  - With no nudge channel yet, the runner polls every 60 seconds.
- [x] 6. Routing docs? — the human adds the `agents/INDEX.md` rows for engine work, routing to
  `crates/koloda-sync/README.md` and `PROTOCOL.md`; agents do not open that file.
  The task updates `agents/RUST.md` for the new `koloda` entry points.
  No `docs/decisions/APP-ROLES.md` row: the engine is a crate with no product surface until the desktop UI task.

## Plan

- [x] 1. Add the koloda-sync crate with space creation
  Goal: new crate `crates/koloda-sync`, a library.
  It is a workspace member with `[lints] workspace = true`, `autotests = false`, and one test binary
  `tests/engine/main.rs`.
  It depends on `koloda`, `koloda-sync-proto`, `tokio`, `reqwest` (rustls, no default features), `ciborium`,
  `serde`, `zstd`, and `uuid`.
  Dev dependencies are `koloda-server`, `axum`, `tower`, and `tempfile`, for the in-process server.

  Build wiring:
  - `project.json` with `lint` (`cargo clippy -p koloda-sync --all-targets -- -D warnings`) and `test`
    (`cargo test -p koloda-sync`), shaped like `crates/koloda-server/project.json`.
  - Its cache inputs add `crates/koloda`, `crates/koloda-sync-proto`, and `crates/koloda-server`.
  - Root scripts `test:rust`, `check:commit`, `check:rust`, and `check:rust-push` run both targets.

  Client:
  - A `Transport` trait sends one request: method, path with query, optional bearer token, body, and content
    encoding.
    It returns the status, the body, and its content encoding.
  - `HttpTransport` implements it on reqwest.
    Tests implement it over `koloda_server::router` in process.
  - Request bodies are CBOR, zstd above a small size; replies may be zstd.
  - A reply decodes into its `ok` body with `meta`, or into an error with its code, message, and `meta`.
    A body that is not a reply, such as a proxy's error page, is a transport error.
  - Every reply's `meta.server_time_ms` updates the skew estimate: server time minus local time on arrival.
  - A server URL must be `https`, or `http` to a loopback host.
  - A transport failure is retried within the call, at most 3 times, with the same body.

  Engine:
  - `Engine::start` takes the database, the secret store, the transport, the platform, and the host's `Starter`.
    It owns a tokio runtime on its own thread.
    Host calls block until done, and database work runs on blocking threads.
  - `create_space(server_url, setup_token, space_name, device_name)` refuses a file with sync state before any
    request.
    It posts `/v1/spaces` with a fresh nonce, which its retries reuse.
    It stores the token in the secret store under `sync.token.<device id>`, then enrolls the file as the creator.
  - `koloda`: `enroll_device` also stores the server URL and epoch, in the same transaction.
    Migration `V9__sync_engine.sql` adds `server_url` and `epoch` to `sync_state`; later items extend it.

  Docs:
  - the crate README: where it sits, the map, "Does NOT own", and read next;
  - the root README layout lists `koloda-sync`;
  - `PROTOCOL.md` §Wire gains the URL rule.
  Constraints:
  - tests drive the router in process, with a temporary data directory and a server clock offset from system time;
  - no sleeps;
  - only the `sync_state` columns this item uses;
  - the schema inventory follows the migration (`agents/DB.md`).
  Done when: tests in `crates/koloda-sync/tests/engine/` cover:
  - creation enrolling the file as creator with its server URL and epoch, with the token in the store;
  - a second creation on the same file refused with no request sent;
  - a wrong setup token: `unauthorized`, the file not enrolled, and nothing stored;
  - a lost reply retried with the same nonce, ending in one space;
  - the URL rule: `https` and loopback `http` accepted, remote `http` refused;
  - a reply body that is not CBOR reported as a transport error;
  - one loopback test serving the real router on `127.0.0.1` and creating a space through `HttpTransport`;
  - `bun run check:push` green, running the new crate's lint and tests.
  Commit: Add the koloda-sync crate with space creation
  Depends on: none

- [x] 2. Push the outbox and settle every outcome
  Goal: `koloda` gains `repo/sync/outbox.rs`.
  - `push_batch(db, max_items, max_bytes)` picks rows still in flight first, so a lost reply's bytes go out again
    unchanged.
    Then it picks not-in-flight rows in `sender_seq` order.
    It takes whole cohorts only and stops before a cohort that would pass a cap.
    It always takes at least one cohort.
    In one transaction it marks the picked rows in flight and their `local` cohorts `uncertain`.
  - `settle_push(db, outcomes)` applies every outcome in one transaction.
    It returns the kinds whose product rows changed, and a stop when pushing must not go on.
    - `applied` and `stale` clear the row.
    - `fenced` clears the row, deletes the entity and its descendants as an applied tombstone would, and fences the
      id with the rejected envelope's stamp.
    - `existence` clears the row; the local row keeps its value.
    - `dependency_fenced { drop_entity }` clears the row and deletes the entity and its descendants without
      publishing.
    - `dependency_fenced { repair_pointer }` clears the row.
    - `held { reason }` moves the row to a new `sync_held` table with its reason.
    - `seq_reused` stops with `behind`.
    Rows the reply did not reach leave flight.
    A cohort with a consumed member that keeps rows becomes `fixed`; one with none returns to `local`.
    A cohort with no rows left is deleted.
  - `push_refused(db, batch)` handles an error reply, which consumed nothing.
    Rows of `uncertain` cohorts leave flight, and those cohorts return to `local`.
    `fixed` cohorts keep their rows in flight.
  - `push_lost(db, batch)` handles a push with no complete reply.
    Every `uncertain` cohort of the batch becomes `fixed`, and its rows stay in flight.
  - `begin_import` also clears `sync_held`.

  The engine's push sends batches until the outbox is empty, a stop arrives, or a reply refuses the push.
  `V9` gains `sync_held`.
  `PROTOCOL.md` §Push outcomes and §Cohorts gain the device-side rules (question 5).
  `crates/koloda/README.md`, `agents/RUST.md`, and `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` name push
  settlement.
  Constraints:
  - each outcome is settled in the transaction that clears or moves its row;
  - every SQL statement stays in `koloda`;
  - the harness's second device is a raw client: a token from a pairing claim the test makes, pushing hand-sealed
    envelopes.
  Done when: tests against the in-process server cover:
  - `applied`, `stale`, and `fenced` (the local deck and its cards are gone, and the deck is fenced);
  - `existence`, and `dependency_fenced` with each action;
  - `held { schema }` after `Server::set_write_schema`, followed by a writable kind that still lands;
  - `seq_reused` stopping the push with `behind`;
  - a lost reply for each consuming outcome: the next push sends the same bytes and gets replays;
    the server ends as after one push, and the cohort is `fixed`;
  - `stamp_ahead` with the server clock 10 minutes behind: nothing consumed, cohorts `local`, rows out of flight;
  - a cap that falls inside a cohort ending the batch before it, and a cohort larger than the cap going alone;
  - `bun run check:push` green.
  Commit: Push the outbox and settle every outcome
  Depends on: 1

- [x] 3. Run the sync cycle over both lanes
  Goal: `Engine::sync_now` runs the cycle (`PROTOCOL.md` §Cycle).
  1. Read the own device record.
     The file is behind if any condition of §Devices holds.
     The third uses `last_observed_server_seq`, a new `sync_state` column.
     A behind file stops before it pushes or pulls, and reports `behind`.
  2. Push (item 2).
  3. Record `head_cold` from `meta.device`.
  4. Pull `hot` from its cursor to head, one `apply_page` per page, advancing to `scanned_through`.
  5. Pull `cold` up to the recorded head, with `max_seq`.
  6. Repeat while the outbox holds rows or a cursor is below its head, up to a bound per call.
  7. After catch-up, run `repair_dangling_defaults`; a repair it captures goes out in the next round.

  A cycle that reaches catch-up stores the record's `last_sender_seq` as `last_observed_server_seq`.
  While the skew estimate exceeds 5 minutes either way (`is_skew_paused`), the cycle stops before push and apply
  and reports `clock_skew`.
  `sync_now` returns the kinds whose product rows changed.
  `PROTOCOL.md` §Cycle, §Skew guards, and §Devices gain the device-side rules.
  Constraints:
  - one transaction per page; nothing buffered across pages;
  - the harness joins a second engine through a test-made claim, `seed_joiner_db`, and a joiner enrollment;
  - it joins before the space holds anything, so an incremental pull from 0 is safe until item 5 adds bootstrap;
  - a transport hook lets a test act between requests.
  Done when: tests cover:
  - two devices converging on decks, cards, grades, edits, and deletes made on either, including a deck delete
    that cascades on the other;
  - a review pushed by another device while `hot` is pulled: it waits for the next cycle, and its card is there;
  - `cold` never pulled past the head recorded before `hot`;
  - each "behind" condition on a copied file: nothing pushed, nothing applied, `behind` reported;
    SQL sets up a condition that a real sequence of writes cannot reach;
  - the skew pause in both directions: 6 minutes stops push and apply, and 4 minutes runs;
  - a dangling learning default repaired after catch-up and pushed;
  - `bun run check:push` green.
  Commit: Run the sync cycle over both lanes
  Depends on: 2

- [x] 4. Drive backfill from the cycle
  Goal: while backfill is pending, each round of the cycle runs `backfill_batch` before it pushes.
  It does so only while the outbox holds less than one push batch, so the outbox never holds the whole database.
  A backfill batch stays under the push cap, so its cohort always fits one push.
  A creator file with rows written before enrollment therefore syncs them all.
  `PROTOCOL.md` §Backfill says how the cycle paces it.
  Constraints: `koloda` keeps scan order and touch rules; engine tests check what reaches the server, not the scan.
  Done when: tests cover:
  - a creator whose algorithms, templates, decks, cards, reviews, and learning settings predate enrollment;
    a joiner converges on all of them, and the server never answers `existence`;
  - a card created during the scan, before its template's batch, reaching the server with no `existence`;
  - the outbox never holding more than one batch past a push batch;
  - `bun run check:push` green.
  Commit: Drive backfill from the sync cycle
  Depends on: 3

- [x] 5. Bootstrap joining devices from snapshot leases
  Goal: `koloda` gains `apply_snapshot_page`, which applies a page's entries by the apply rule and leaves the cursors
  alone.
  A second call sets one lane's cursor once its snapshot and catch-up are applied.
  `V9` gains a bootstrap flag on `sync_state`.
  Every path that makes a joiner active sets it: joiner enrollment, `add_to_space`, and `replace_with_space`.

  The engine bootstraps a file whose flag is set, before anything else in the cycle:
  1. Open a lease and record its `head_hot` and `head_cold`.
  2. Stream `hot` pages through `apply_snapshot_page` until `done`.
  3. Catch `hot` up with incremental pulls from `head_hot` to a head read after the lease, and set its cursor.
  4. Stream `cold` pages (newest first) until `done`, and set the `cold` cursor to the lease's `head_cold`.
  5. Release the lease, clear the flag, and run `repair_dangling_defaults`.
  6. The normal cycle then pulls `cold` from that head.

  Nothing is pushed while the flag is set; repairs captured meanwhile wait in the outbox.
  A heartbeat goes out when the last reply's server time is within half a TTL of `expires_at`.
  `410 lease_expired` restarts from step 1; union apply makes the repeat safe.
  `429 rate_limited` stops the bootstrap until the next cycle.
  The item 3 harness joins through bootstrap from here on.
  `PROTOCOL.md` §Bootstrap gains the device's order, the flag, and the restart.
  `crates/koloda/README.md` and `agents/RUST.md` name snapshot apply.
  Done when: tests cover:
  - a fresh bootstrap of a space whose oldest deck predates every live algorithm: algorithms stream first, and no
    default row is created;
  - a compacted bootstrap of edited-then-graded and graded-then-edited cards while another device writes between
    pages;
  - a deck deleted after the lease opens: catch-up delivers the tombstone, and the joiner ends without the deck;
  - a review pushed after the lease arriving through the incremental `cold` pull;
  - a lease that expires mid-stream (server clock past the TTL): the bootstrap restarts and converges;
  - heartbeats keeping a lease alive across pages spread over more than one TTL of server time;
  - a default row created during bootstrap reaching the server only after catch-up;
  - a relaunch mid-bootstrap: a new engine on the same file bootstraps again and never pulls `hot` from 0;
  - `bun run check:push` green.
  Commit: Bootstrap joining devices from snapshot leases
  Depends on: 3

- [x] 6. Pair devices and join blank or seed-only files
  Goal:
  - `issue_pairing(hint)` issues a code for the own space.
    It returns the code, its expiry, the server URL, and the space id.
    The hint is opaque bytes, at most `MAX_HINT_BYTES`.
  - `preview(server_url, code)` returns the space's id, name, counts, and bytes, and consumes nothing.
  - `join(server_url, code, device_name, seed_settings)`:
    1. Preview, then read `join_mode` for the previewed space.
       A file that would re-attach is refused before its code is used.
    2. Claim with a fresh nonce, which retries after a lost reply reuse.
    3. Store the token.
    4. Blank: `seed_joiner_db`, then a joiner enrollment.
       Untouched seed: `begin_import`, the probe, and `add_to_space` without asking.
       Used: item 7.
    5. Return the mode and the setup hint; the cycle then bootstraps.
  - The probe sends `probe_ids` pages to `ids/known` in chunks of at most 1000.
  - `begin_import` also stores the server URL and epoch.

  `PROTOCOL.md` §Pairing and §Joining gain the preview-first rule and the claim retry.
  Constraints:
  - codes and tokens are never logged;
  - `koloda`'s join tests own the join rules; engine tests own the calls around them.
  Done when: tests cover:
  - a blank file joining and converging, with the hint returned;
  - start-fresh-then-join into a space that holds the seed rows;
  - start-fresh-then-join into a space that deleted the seed template: the local seed row is deleted, never pushed;
  - a wrong code: `pairing_failed`, and the file unchanged;
  - a re-attaching file refused, with its code still claimable;
  - a lost claim reply retried to the same device and token;
  - `bun run check:push` green.
  Commit: Pair devices and join blank or seed-only files
  Depends on: 5

- [x] 7. Join with a used file through Add or Replace
  Goal: for a used file, `join` claims, runs `begin_import`, probes, and returns that a choice is needed.
  With it comes how many local ids the space already holds; any known id means a likely copy, for which Replace is
  the safer choice.
  `import(mode)` finishes the join.
  Add probes again, then runs `add_to_space`; Replace runs `replace_with_space`.
  The cycle then bootstraps.
  While the file is `import_pending`, the cycle does nothing.
  After a relaunch the file is still pending, and `import` works on the new engine.
  Constraints: no probe answer is stored; Add asks the space again.
  Done when: tests cover:
  - Add of an unrelated database: nothing reminted, and both sides end with the union;
  - Add of a copy: the space and the joiner converge on the union;
  - Replace: the joiner ends with exactly the space's rows;
  - a probe of more than 1000 ids, spanning two calls;
  - a relaunch between `join` and `import`;
  - `bun run check:push` green.
  Commit: Join with a used file through Add or Replace
  Depends on: 6

- [x] 8. List, revoke, and detach devices
  Goal:
  - `devices()` lists the space's devices, marking the caller.
  - `revoke_device(id)` revokes another device.
  - `detach()` revokes the own device, then detaches the file.

  Detaching deletes the token and records `detached_at`, a new `sync_state` column.
  Rows and sync tables stay.
  The engine sends no request while detached; capture keeps recording, for a later re-attach.
  A `401 revoked` reply to any call detaches the same way.
  `401 unknown_device` stops the engine and reports it, because recovery comes later.
  `PROTOCOL.md` §Devices gains the local detach.
  Done when: tests cover:
  - the list, with names, platforms, and the caller marked;
  - A revoking B: B's next call detaches it, B keeps its rows, and B sends nothing more;
  - detach: the own record is revoked, and the file is detached;
  - an unknown device token stopping the engine with `unknown_device`;
  - `bun run check:push` green.
  Commit: List, revoke, and detach devices
  Depends on: 3

- [x] 9. Run the engine in the background with status and events
  Goal:
  - A runner on the engine's runtime runs the cycle on triggers:
    - `notify_local_change`, coalesced over 300 ms;
    - `nudge`, for app foreground and network regained;
    - `sync_now`;
    - a poll every 60 seconds while no nudge channel exists.
    One cycle runs at a time; a trigger during a cycle runs one more after it.
    After an error the runner backs off, doubling up to the poll interval.
  - `status()` returns:
    - the state: not enrolled, import pending, bootstrapping, idle, syncing, or stopped with its reason;
    - the reasons: behind, clock skew, revoked, unknown device, a refused push, or an error;
    - the last success time, the pending and held counts, the lag per lane, and the skew.
  - Events go to a host sink: `Changed { kinds }`, `Status`, and `Error`.
  - `tick(budget)` runs one bounded pass.
    The budget is wall time and body bytes, checked before each request and each page apply.
    The next tick resumes from the cursors.

  `PROTOCOL.md` §Cycle notes the poll interval until nudges exist.
  Constraints: time-based behavior runs on tokio's paused clock or an injected timer; no sleeps.
  Done when: tests cover:
  - several local changes within 300 ms running one cycle;
  - a trigger during a cycle running exactly one more;
  - a `Changed` event naming the kinds a pull changed;
  - status for each stop reason the earlier items report;
  - a tick with a small byte budget stopping between pages, and the next tick finishing from the cursor;
  - `bun run check:push` green.
  Commit: Run the sync engine in the background with status and events
  Depends on: 1–8

## Outcome

- `crates/koloda-sync` is a library crate that links `koloda` and `koloda-sync-proto`.
  Its nx `lint` and `test` targets run in `check:commit`, `check:rust`, `check:rust-push`, and `test:rust`.
- `Transport` sends one request; `HttpTransport` implements it on reqwest (rustls, no default features).
  Tests call `koloda_server::router` in process, and one loopback test creates a space through real HTTP.
  Bodies are CBOR, zstd above a small size.
  A body that zstd would not shrink, or that would expand past the server's ratio, goes out uncompressed, because the
  server refuses that encoding on every retry.
  Every reply's `meta.server_time_ms` updates the skew estimate: server time minus local time on arrival.
  A server URL is `https`, or `http` to a loopback host.
  A transport failure retries at most 3 times with the same body.
- `Engine` owns a tokio runtime on its own thread.
  Host calls block until done, and database work runs on blocking threads.
  `create_space` refuses a file that already has sync state, posts with a nonce its retries reuse, stores the token,
  and enrolls the file as creator with its server URL and epoch.
- `koloda` gains `repo/sync/outbox.rs`: `push_batch` sends in-flight rows first and never splits a cohort;
  `settle_push` applies every outcome in one transaction; `push_refused` and `push_lost` fix cohorts as
  `PROTOCOL.md` says.
  `applied` and `stale` clear the row; `fenced` deletes the entity and fences its id; `existence` and
  `repair_pointer` clear the row; `drop_entity` deletes without publishing; `held` moves the row to `sync_held`;
  `seq_reused` stops with `behind`.
- Migration `V9__sync_engine.sql` adds `server_url`, `epoch`, `sync_held`, `last_observed_server_seq`,
  `is_bootstrapping`, and `detached_at`.
- `sync_now` runs the cycle: the behind check, push, `hot` to head, `cold` up to the head recorded before `hot`,
  then another round while the outbox or a cursor is behind, up to a bound.
  While backfill is pending, a round runs `backfill_batch` before push, and only while the outbox holds less than
  one push batch.
  After catch-up it repairs dangling learning defaults and stores `last_observed_server_seq`.
  A skew past 5 minutes either way stops the cycle with `clock_skew` before push and apply.
- A joiner bootstraps before anything else: lease, `hot` snapshot, `hot` catch-up, `cold` snapshot to the lease's
  cold head, release, then the normal cycle pulls `cold`.
  Nothing is pushed while the flag is set.
  A heartbeat goes out near expiry; `410 lease_expired` restarts; `429 rate_limited` waits for the next cycle.
  A lease that lapses after its pages are applied is released without restarting a finished bootstrap.
- Pairing issues a code, previews, and joins.
  Blank files are seeded then enrolled; an untouched seed joins through Add without a choice; a used file returns
  for `import` as Add or Replace.
  A file that would re-attach is refused before its code is used.
  A lost claim retries the same nonce.
  While `import_pending`, the cycle does nothing.
- `devices` lists the space and marks the caller.
  `revoke_device` revokes another device.
  `detach` revokes the own device, deletes the token, records `detached_at`, and sends nothing more; rows and sync
  tables stay.
  `401 revoked` detaches the same way.
  `401 unknown_device` stops the engine.
- A runner coalesces `notify_local_change` over 300 ms, accepts `nudge` and `sync_now`, and polls every 60 seconds.
  One cycle runs at a time; a trigger during a cycle runs one more after it.
  After an error it backs off, doubling up to the poll interval.
  `status` reports the state, the stop reason, the last success, pending and held counts, lag per lane, and the skew.
  Events are `Changed { kinds }`, `Status`, and `Error`.
  `tick` spends a wall-time and byte budget on cycle requests only, checked before each request and each page apply;
  host calls made during a tick are not limited by it.
- `PROTOCOL.md` gained the device-side rules this task implements: push outcomes, cohorts, the cycle, skew, devices,
  backfill pacing, bootstrap, pairing, and the poll interval.
  `agents/INDEX.md` rows for engine work are still to be added by the human (question 6).
- Deviations from the plan text:
  - A request body that zstd would expand past the server's ratio, or would not shrink, is sent uncompressed.
  - A tick's budget limits cycle requests only.
  - Releasing a lease that already expired after the last page does not restart a finished bootstrap.
- Manual verify: none — nothing user-visible until the NAPI commands and the desktop UI land.
