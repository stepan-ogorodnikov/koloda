# Sync engine audit fixes

Status: done
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, crates/koloda-sync/README.md, crates/koloda-sync-proto/PROTOCOL.md, crates/koloda/src/repo/sync/README.md, agents/RUST.md, agents/DB.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, crates/koloda-server/README.md, apps/electron/README.md, agents/TESTING.md, agents/CODE-DOCUMENTATION.md, agents/BACKWARDS-COMPATIBILITY.md, agents/MARKDOWN.md, agents/VERIFY.md, agents/REVIEW.md
Flow: local

## Intent

Settle every finding of the audit of `crates/koloda-sync` at `61c8418a` (`main`).
Its report was `tmp/audits/sync-engine.md`, which git ignores.
This file restates every finding and its evidence, so neither the next session nor the archive reader needs it.
The audit ran `cargo test -p koloda-sync`: 153 passed.
Its verdict: the engine follows `PROTOCOL.md` closely, the `koloda` boundary holds, and the tests are strong.
The findings sit where the engine meets things outside the protocol: the OS keyring, proxies, and the runner loop.

Done when:

- after a restore that predates this device, or rotated every token, the status keeps asking to pair again, through
  later cycles and a relaunch;
- "Leave the space" works while an authoritative restore waits, and the device keeps its data;
- a runner whose file is detached, not enrolled, holding a restore, or unknown to the server emits no `Error` events
  and makes no requests until a trigger;
- on the desktop, two live copies of one file both keep syncing after the copy forks, also after a relaunch;
- one image a proxy refuses no longer holds back the others, and the server README states the proxy's body limit;
- an events socket closed at once reconnects with a growing wait;
- a re-bootstrap whose cleanup outlasts the lease, or whose tick spent its budget, does not re-bootstrap again;
- a tick that leaves work reports `is_done: false`;
- tests pin the runner's error backoff, `MAX_LEASES`, and `MAX_RESTORES`;
- `Opened::Refused` carries no reply;
- `PROTOCOL.md` §Skew guards says which claims check skew, as the code does;
- `bun run check:push` is green, and the close-out has a Manual verify block for findings 1 and 11.

## Scope

In:

- `koloda-sync`: status, runner, events, devices, fork, client, attachments, bootstrap, tick, transport, and tests.
- `koloda`: client migration `V16` (the detach reason), `detach`, `sync_state`, `switch_device`.
- `apps/electron/src-rust/src/sync.rs`: one comment.
- `crates/koloda-sync-proto/PROTOCOL.md`, `crates/koloda-sync/README.md`, `crates/koloda/src/repo/sync/README.md`,
  `crates/koloda-server/README.md`, each with the item that makes it true.

Findings, numbered as in the report.
Line numbers are at `61c8418a`.

- 1. Spec violation, Should-fix: the "pair again" status reverts to "revoked" after one more cycle or a relaunch.
  Decision: fixed by item 1.
  - A `PairAgain` cycle detaches the file and records `Stop::Restored` (`engine.rs:310-319`, `engine.rs:379`).
  - The next cycle fails at `session()` with `Detached` (`engine.rs:547-548`).
    `recorded_cycle` then overwrites the stop with `Stop::of(Detached)`, which is `Stop::Revoked`
    (`engine.rs:379`, `status.rs:74`).
  - `status()` shows `Restored` only while `run.stop` holds it (`status.rs:135-139`), and `run.stop` lives only in
    memory.
    `koloda`'s `detach` records only `detached_at` (`crates/koloda/src/repo/sync/mod.rs:290-296`).
  - The runner's first error backoff is 1 s (`runner.rs:24`, `runner.rs:178-181`).
    So a desktop shows "pair again" for about a second, then "revoked" (see finding 5).
    A relaunch shows "revoked" at once: the new process has no `run.stop`.
  - Spec: `PROTOCOL.md` §Devices (line 771) says the status "asks for a new pairing rather than reporting a
    revocation".
    The host relies on the distinction (`apps/electron/src-rust/src/sync.rs:319`).
  - Test gap: `is_told_to_pair_again` (`restore_tests.rs:485-488`) checks the status only after the first cycle.
- 2. Spec violation, Later: a re-attach records its claim without the skew check that §Skew guards requires.
  Decision: fixed by item 11, which narrows the spec sentence; the code stays.
  - `join` checks skew after the claim and before recording it (`pairing.rs:364-367`).
  - `reattach` claims (`pairing.rs:214`), then runs `switch_device` with `now_ms` from the local clock
    (`pairing.rs:244-257`), with no `check_skew()`.
  - Spec: `PROTOCOL.md` §Skew guards (line 621): "A claim or a space creation checks the skew of its reply before
    the file records it."
  - Impact is low: the cohorts re-stamped under the new id stay `local`, so the next cycle's skew pause re-stamps
    them again.
    The rule's stated reason, reserved backfill stamps, does not apply: a re-attach reserves none.
- 3. Risk, Should-fix: a fork deletes the old device's token from a keyring the original copy shares.
  Decision: fixed by item 5.
  - After the switch, `fork` removes `sync.token.<old device>` (`fork.rs:54-55`), as `README.md:21` describes.
  - On the desktop, every data directory of one OS user shares one keyring service, `koloda`, keyed only by device
    id (`crates/koloda/src/app/secrets.rs:9`, `:366`; host `apps/electron/src-rust/src/sync.rs:164`).
  - A second data directory is one environment variable away (`KOLODA_USER_DATA`, `apps/electron/src/main.ts:14-17`).
    A copy on another machine has no token at all, so every desktop two-live-copies case shares one keyring entry.
  - When the copy forks, it deletes the original's token.
    The original keeps working only while its process caches the secret (`secrets.rs:69`).
    After a relaunch, `session()` finds no token and every cycle fails `NotEnrolled` (`engine.rs:550-552`).
    The user must detach and pair again.
  - `detach` deletes its device's token the same way (`devices.rs:116`).
    After a fork each copy has its own device id and key; before one, the revoke already ends the shared record.
  - Spec: `PROTOCOL.md` §Behind its own record (line 818): "The old record keeps working for the other copy, if
    there is one."
    Conformance case: "Two live copies of one file (the second forks, both keep syncing)."
  - Mocked until green: `fork_tests.rs:106-143` passes only because `TestServer::copy` gives the copy its own
    `MemorySecrets` (`tests/engine/common.rs:231`, `:999-1004`), which the host never does.
- 4. Risk, Should-fix: a proxy that refuses a body without a sync reply stalls push, pull, and images.
  Decision: fixed by item 4; pushes stay as they are and only the README guards them (see Out).
  - A reply that is not a sync reply becomes a `TransportError` (`client.rs:120-157`, `client.rs:206`).
    `call` retries it with the same bytes, then reports `SyncError::Transport` (`client.rs:95-104`).
  - Push treats that as a lost reply: its cohorts are fixed and its rows stay in flight (`push.rs:106-110`).
    Every later push resends those rows first (§Cohorts).
    So a batch over a proxy's body limit fails forever.
    The push error also ends the cycle before any pull (`cycle.rs:147`), so the device stops receiving too.
    Batches go up to 4 MiB of envelopes before zstd (`push.rs:19-20`).
  - Images go up to 5 MiB and barely compress.
    An upload that gets a `TransportError` is not deferred: it ends the cycle's transfers (`attachments.rs:153`).
    It stays at the head of the queue (`crates/koloda/src/repo/sync/attachments.rs:92`, `ORDER BY next_attempt_at`).
    Every later upload and fetch waits behind it, and every cycle ends in an error.
  - Why this is likely: `crates/koloda-server/README.md:43-44` tells operators to put a TLS reverse proxy in front.
    It names the WebSocket requirement and no body size; nginx's `client_max_body_size` defaults to 1 MiB.
  - Spec tension: §Upload says "one blob the server fails on holds back no other" (line 1675).
    It also says "A transfer that gets no reply ends the cycle's transfers" (line 1676).
    A proxy refusal falls between the two rules.
- 5. Risk, Should-fix: the runner never idles in a waiting state; it cycles, backs off, and emits `Error` every
  minute.
  Decision: fixed by item 3.
  - `run_cycle` emits `Event::Error` for every error except `BudgetSpent` and `Metered` (`engine.rs:338-342`).
  - `run_forever` treats every other error as a fault and backs off up to 60 s (`runner.rs:165-183`).
  - Waiting states fail every cycle: `Detached` and `NotEnrolled` at `session()` (`engine.rs:546-552`),
    `RestoreHeld` at the top of the cycle (`cycle.rs:55-57`), and `UnknownDevice` from the device record call
    (`engine.rs:320-323`).
  - The engine has no call that stops the runner, and the host's `detach` does not try to (`sync.rs:243-247`).
  - The host states the invariant this breaks (`apps/electron/src-rust/src/sync.rs:286`): "the runner is never
    started on a file in no space; there every cycle fails and emits an `Error`".
    A revoke, a detach, or `PairAgain` while the runner runs puts it exactly there.
    Main logs each event (`apps/electron/src/sync-ipc.ts:30`).
  - With `UnknownDevice`, the runner also calls the server every 60 s.
    So does the events socket: a refused upgrade retries with backoff up to 60 s (`events.rs:58-68`), found while
    planning.
  - Spec: §Devices (line 772): "A `401 unknown_device` on the epoch the device sent stops the engine."
    The repeated cycles are also how finding 1 happens.
- 6. Risk, Later: the events socket resets its reconnect backoff on every close.
  Decision: fixed by item 8.
  - `Listened::Closed` resets `retry` to 1 s (`events.rs:54-57`), and every close also fires a cycle
    (`events.rs:121-123`).
  - So a socket that is accepted and closed at once reconnects every second, and runs a cycle each time.
  - Two cases produce it: a proxy that closes upgraded connections, or two engines that share one device id before
    the fork, where each new socket closes the other's (§Events).
  - Spec: §Events (line 962): "The device reconnects after a close or an error, waiting 1 second and doubling up to
    60."
- 7. Risk, Later: a re-bootstrap whose lease is not released keeps `rebase_required` and re-bootstraps again.
  Decision: fixed by item 6.
  - After a `Rebase`, the server clears `rebase_required` only on release (§Devices).
    Two paths skip the release, and each costs a full second re-bootstrap.
    Both stay below normal personal scale.
  - Lapse path: `release` maps `410 lease_expired` to success (`bootstrap.rs:175-182`).
    Heartbeats happen only before page requests (`bootstrap.rs:197`, `cycle.rs:267-269`).
    So an absence cleanup (`finish_rebase`, `bootstrap.rs:129-132`) that outlasts the lease's remaining TTL makes
    the release a lapse; that TTL can be as little as half.
  - Tick path: `release` goes through `cycle_client`, whose budget check refuses it once the last page spent the
    tick (`client.rs:71-80`).
    The barrier is already closed, so the next tick re-bootstraps from the start.
    A snapshot near one tick's budget then loops.
  - The comment at `bootstrap.rs:121-122` names the failed-release cost but not these two causes.
- 8. Risk, Later: a tick reports `is_done` with work left.
  Decision: fixed by item 7.
  - `tick` maps any `Ok(())` to `Ticked { is_done: true }` (`engine.rs:165-176`).
  - Two kinds of leftover work end a cycle `Ok`: transfers cut at 64 MiB or by a trigger (`attachments.rs:96-98`,
    `engine.rs:414-421`), and rounds exhausted at `MAX_ROUNDS` (`cycle.rs:204-205`).
  - The trigger fired at `engine.rs:417-419` reaches only a runner, so a host that only ticks waits for its next
    schedule.
  - Mobile is the only tick host, and it does not exist yet.
- 9. Improvement, Later: the runner's error backoff and the lease and restore caps have no test.
  Decision: fixed by item 10.
  - Untested: the error backoff in `runner.rs:178-182`, which doubles from 1 s to 60 s and resets on success;
    `MAX_LEASES` (`bootstrap.rs:58-67`); and `MAX_RESTORES` (`engine.rs:389-399`).
  - `grep -n "backoff\|MAX_LEASES\|MAX_RESTORES" crates/koloda-sync/tests/engine/*.rs` finds only attachment and
    socket backoff tests.
  - A dropped reset or cap would pass every test, against `agents/TESTING.md`: "Threshold rules: test at the limit
    and one past it".
- 10. Improvement, Later: `Opened::Refused` carries a reply nothing reads.
  Decision: fixed by item 9.
  - The only consumer matches `Opened::Refused(_)` (`events.rs:97`).
  - `HttpTransport::listen` still reads the whole body (`transport.rs:192`).
    If that read fails, a refusal becomes `Unreachable`, which starts no cycle (`events.rs:58-64`).
  - `grep -rn "Opened::Refused" crates/koloda-sync apps/electron/src-rust` finds only the definition,
    `transport.rs:192`, `events.rs:97`, and the test transport.
- 11. Spec violation, Should-fix: a held authoritative restore blocks `detach`, though the screen offers it.
  First reported as a product decision; the desktop screen showed the code contradicts `docs/specs/SYNC.md`.
  Decision: leaving works while a restore is held; fixed by item 2.
  - `hold_authoritative` keeps the old `epoch` (`crates/koloda/src/repo/sync/authoritative.rs:18-31`).
  - So `detach`'s revoke call gets `epoch_changed` (`devices.rs:84-102`).
    `settle_device` records the hold again and returns `RestoreHeld` (`engine.rs:290-301`, `restore.rs:36-40`).
    The file stays attached.
  - The only way out of the held state is `accept_restore`, which discards every write made after the backup.
  - In the held state the sync screen renders the status and the device list
    (`libs/settings-react/src/lib/sync/settings-sync.tsx:52-55`).
    The device list always renders "Leave the space" (`settings-sync-devices.tsx:56`), so the screen offers an
    action that always fails.
  - Spec: `docs/specs/SYNC.md` §Leaving a Space: "Leaving needs the server: while the server cannot be reached,
    leaving fails and says why".
    Leaving fails for no other reason.
    The held-state rule (§When Sync Stops) blocks syncing, not leaving.
    `PROTOCOL.md` §Server restore (line 1458) is silent on leaving.

The report also pointed outside its scope: `koloda`'s `due_transfers` loads every due queue row on each call and
stops at the limit (`crates/koloda/src/repo/sync/attachments.rs:86-116`).
The engine calls it once per 16 transfers (`attachments.rs:22`, `:89-91`), so a large image backlog costs O(n²/16)
row reads.
It is not a finding of this audit and belongs to a `koloda` sync audit.

Out:

- Finding 2's code fix, a `check_skew()` in `reattach` (human: narrow the sentence instead).
- Pushes that a proxy refuses without a sync reply: they stay "maybe consumed", since a proxy may have passed the
  request on before it failed.
  The README requirement in item 4 is their guard.
- Fetches that get a reply that is not a sync reply: a `GET` carries no body a proxy limit refuses.
- The `due_transfers` pointer above.
- Leaving while the server cannot be reached; `SYNC.md` already says it fails.
- The mobile host.

## Open questions

- [x] 1. Triage? — the human, 2026-10-14.
  Fix 1 and 3 to 11; for 2, narrow the `PROTOCOL.md` sentence instead.
- [x] 2. Finding 11: does leaving work while a restore is held? — yes (human, 2026-10-14).
- [x] 3. Flow? — `local` (human, 2026-10-14).
- [x] 4. Finding 4: which replies that are not sync replies defer an upload? — a `4xx` only (human, 2026-10-14).
  The recommendation: a `4xx` only, which is the proxy refusing this request.
  A `5xx` that is not a sync reply, such as a proxy's `502` while the server is down, keeps ending the cycle's
  transfers, as no reply does.
  Deferring any such reply would defer every queued image one by one when the server goes down mid-transfer, each
  with its own backoff and `Error` event.
  Item 4 follows it.
- [x] 5. Finding 5: which results make the runner wait, and does the socket close too? — as recommended (human,
  2026-10-14).
  The recommendation: the report's four (`Detached`, `NotEnrolled`, `RestoreHeld`, `UnknownDevice`).
  Add `Revoked` and `PairAgain`, which detach the file in the cycle that returns them.
  Also open no events socket while the last cycle stopped on `UnknownDevice`.
  The socket otherwise retries the server every 60 s, and §Devices says that reply stops the engine.
  A local change or a nudge still runs one cycle, so an unknown device then calls the server once per trigger.
  Item 3 follows it.

## Plan

- [x] 1. Keep the pair-again status across cycles and relaunches
  Goal (finding 1):
  - Client migration `crates/koloda/src/migrations/V16__sync_detach_reason.sql` adds `sync_state.detach_reason`
    (`text`): `revoked` or `pair_again`.
    It is NULL while the file is attached, and for files detached before `V16`, which keep showing "revoked".
  - `koloda::repo::sync::detach` takes the reason and writes it with `detached_at`.
    `switch_device` clears it where it clears `detached_at` (`crates/koloda/src/repo/sync/switch.rs:51`).
    `SyncState` exposes it, read in `sync_state`.
  - The engine's `detach_locally` (`devices.rs:106-118`) takes the reason.
    `settle_device` passes `pair_again` for `SyncError::PairAgain` and `revoked` for a `401 revoked`.
    `detach` in `devices.rs` passes `revoked`, both for a user's leave and for a file whose token is gone.
  - `status()` shows a detached file as `Stopped(Restored)` when its reason is `pair_again`, else `Stopped(Revoked)`.
    It no longer reads `run.stop` for a detached file (`status.rs:135-139`).
    So a later `Detached` cycle cannot change what shows, and `recorded_cycle` needs no special case.
    This replaces the report's "keep the existing stop on a `Detached` cycle": the stored reason covers both.
  - `PROTOCOL.md` §Devices: detaching "records when and why, then deletes the token" (line 763).
    §Client state's `sync_state` row lists when and why the file detached.
    `crates/koloda/src/repo/sync/README.md` (**Detach**, line 95) says the same.
  Constraints:
  - `agents/DB.md`: a new file, never an edit of an applied one; touch `migrations/mod.rs`; regenerate
    `schema-inventory.json` with `cargo test -p koloda --test integration write_schema_inventory_snapshot -- --ignored`.
  - The web stack never writes `sync_state`, so no TS change.
  - The host already shows `Restored` as "pair again" (`apps/electron/src-rust/src/sync.rs:319`); no host change.
  Done when:
  - `is_told_to_pair_again` (`restore_tests.rs:485-488`) also checks the status after a second `sync_now` and after
    `TestServer::relaunch`, and every test that uses it passes;
  - a test: a file the server revoked still shows `Revoked` after a relaunch;
  - `cargo test -p koloda`, `cargo test -p koloda-sync`, and `bunx nx test @koloda/db-sqlite` pass;
  - `bun run check:push` green.
  Commit: Keep the pair-again status across cycles and relaunches
  Depends on: none

- [x] 2. Leave a space while an authoritative restore is held
  Goal (finding 11, per question 2):
  - `detach` (`devices.rs:84-102`) sends its revoke through `call_across_restore` (`pairing.rs:270-296`).
    Move that helper where both modules use it, or make it `pub(crate)`.
  - A held file's first revoke names the old epoch, which `hold_authoritative` keeps, and gets `epoch_changed`.
    `call_across_restore` records the restore again and repeats the revoke on the restored epoch.
    A heal restore met the same way begins its scan, as a cycle would.
  - The file then detaches locally as now: its rows stay.
    So does the hold record, so a later re-attach to this space meets the same restore and holds it (§Server restore,
    last line).
  - `PROTOCOL.md` §Server restore, beside line 1458: a file holding the restore can still leave the space.
    Its revoke names the restored epoch, and the record stays for a later re-attach.
  Constraints:
  - `accept_restore` and the cycle's hold are unchanged; no server change.
  - `docs/specs/SYNC.md` already says leaving fails only when the server cannot be reached; no spec change.
  Done when:
  - a test in `restore_tests.rs`: a device holding an authoritative restore detaches.
    Its rows and outbox stay, the space lists its device revoked, and its status shows `Revoked`.
  - a test: that file re-attaches with a new code and holds the restore (`is_held`), as
    `a_re_attach_after_an_authoritative_restore_holds_then_converges` does;
  - `bun run check:push` green.
  Commit: Leave a space while an authoritative restore is held
  Depends on: none

- [x] 3. Let the runner wait without errors while the file cannot sync
  Goal (finding 5, per question 5):
  - Waiting results: `Detached`, `NotEnrolled`, `RestoreHeld`, `UnknownDevice`, `Revoked`, and `PairAgain`.
  - `run_cycle` (`engine.rs:338-342`) emits no `Event::Error` for them; the status event already says why.
  - `run_forever` (`runner.rs:165-183`) waits for a trigger with no timeout after one, and resets the backoff.
    Join, import, and create (the host's `sync_soon` nudges), `accept_restore`, `set_network`, `allow_metered`, a
    nudge, and a local change each fire one.
  - `retarget` (`events.rs:129-146`) points the socket nowhere while the last cycle stopped on `UnknownDevice`.
    The other waiting states already close it.
  - The host comment at `apps/electron/src-rust/src/sync.rs:286` stops saying that every cycle in no space emits an
    `Error`; when the host starts the runner is unchanged.
  - The `runner.rs` entry in `crates/koloda-sync/README.md` names the waiting states.
  Constraints:
  - Every other error keeps the 1 s to 60 s backoff.
  - `sync_now` and `tick` still return these errors to the host.
  Done when:
  - a `ManualTimer` runner test, one case per waiting state the harness reaches (revoked, detached by the user,
    authoritative restore held, unknown device):
    after the cycle that stops, the runner emits no `Error` event and sends no request until a trigger;
    a nudge then runs exactly one cycle;
  - the unknown-device case checks with `TestTransport::sent` that no socket upgrade goes out either;
  - `bun run check:push` green.
  Commit: Let the runner wait without errors while the file cannot sync
  Depends on: none

- [x] 4. Defer an upload a proxy refuses without a sync reply
  Goal (finding 4, per question 4):
  - `crates/koloda-server/README.md`, beside line 44: a proxy must accept request bodies of 16 MiB, the protocol's
    cap (`MAX_BODY_BYTES`).
    nginx's `client_max_body_size` defaults to 1 MiB.
  - `Client::call` (`client.rs:94-104`) tells a reply that arrived but is not a sync reply apart from no reply, and
    keeps that reply's status.
    For example `SyncError::Transport` carries the status as an `Option<u16>`, or a new variant does.
  - Push still treats both as lost (`push.rs:106`).
    The host still maps both to `unreachable` (`apps/electron/src-rust/src/sync.rs:348`).
  - `upload` (`attachments.rs:139-154`) defers, through `defer_faulted`, a transfer whose reply was not a sync reply
    and had a `4xx` status.
    The next image goes on in the same cycle.
  - `PROTOCOL.md` §Upload (line 1676): an upload refused by a `4xx` that is not a sync reply waits like a `5xx`.
    A transfer that gets no reply, or a `5xx` that is not a sync reply, still ends the cycle's transfers.
  Constraints:
  - No wire change; `call`'s retries are unchanged.
  - Fetch is unchanged (see Out).
  Done when:
  - a test: an upload answered `413` with a body that is not a sync reply, as nginx sends one, waits out its backoff;
    the next queued image goes up in the same cycle;
  - a test: the same refusal of a push still fixes its cohorts as lost;
  - `bun run check:push` green.
  Commit: Defer an upload a proxy refuses without a sync reply
  Depends on: none

- [x] 5. Keep the old device's token when a copy forks
  Goal (finding 3):
  - `fork` (`fork.rs:54-55`) removes only `sync.pending_token.<nonce>` after the switch.
    It leaves `sync.token.<old device>`, which another copy of the file may read from the same keyring.
  - A rolled-back file then leaves one orphan secret, which is cheap.
  - `crates/koloda-sync/README.md:21`: a fork keeps the old device's token.
    `PROTOCOL.md` §Behind its own record, step 3: the old device's token stays in the secret store.
  - The engine harness can build a copy that shares the original's secret store, as the desktop does.
    For example `device_on` takes an `Arc<MemorySecrets>`.
  - `two_live_copies_both_keep_syncing_and_a_write_on_the_copy_reaches_the_space` (`fork_tests.rs:106-143`) uses one
    shared store.
    It also syncs the original after `TestServer::relaunch`.
  Constraints:
  - Rollback fork tests keep their own stores, unless one asserts the old token is removed; that one asserts it stays.
  Done when:
  - the copy test passes on one shared store, and fails with the old removal back (checked by hand once);
  - `bun run check:push` green.
  Commit: Keep the old device's token when a copy forks
  Depends on: none

- [x] 6. Release a re-bootstrap's lease after a slow cleanup or a spent tick
  Goal (finding 7):
  - Before `finish_rebase` (`bootstrap.rs:129-132`), the bootstrap heartbeats the lease once, whatever its remaining
    TTL, so the absence cleanup starts with a full TTL.
    A join bootstrap needs none: its flag clears before the release.
  - `release` (`bootstrap.rs:165-185`) and that heartbeat go through `device_client`, not `cycle_client`.
    A tick whose last page spent its budget still releases, and the server clears `rebase_required`.
    The page requests keep spending the budget.
  - The comment at `bootstrap.rs:121-122` names what is left: a release that gets no reply.
  - `PROTOCOL.md` §Re-bootstrap, steps 4 and 5: the cleanup starts after a heartbeat, and the release spends no tick
    budget.
  Constraints:
  - Lease handling is otherwise unchanged, `MAX_LEASES` included.
  Done when:
  - a test: a re-bootstrap under a `tick` whose budget the last snapshot page spends releases its lease
    (`count_leases` is 0); the next tick runs no second re-bootstrap;
  - a test: `TestTransport::sent` shows a heartbeat between the last snapshot page and the release;
  - `bun run check:push` green.
  Commit: Release a re-bootstrap's lease after a slow cleanup or a spent tick
  Depends on: none

- [x] 7. Report a tick as not done while transfers or rounds remain
  Goal (finding 8):
  - `sync` (`engine.rs:384-423`) reports whether work is left.
    Either transfers are still due (cut at `CYCLE_BYTES` or by a trigger, `attachments.rs:96-98`), or the cycle's
    `MAX_ROUNDS` ran out before catch-up (`cycle.rs:204-205`).
  - `tick` (`engine.rs:165-176`) returns `is_done: false` for either.
  Constraints:
  - `sync_now` and the runner are unchanged; the trigger for transfers still due still fires for the runner.
  Done when:
  - a test: a tick whose transfers a trigger cut short reports `is_done: false`, and the next tick `true`;
  - a test: a tick whose rounds ran out before catch-up, because another device pushes during each round, reports
    `is_done: false`;
  - `bun run check:push` green.
  Commit: Report a tick as not done while transfers or rounds remain
  Depends on: none

- [x] 8. Keep the events socket's backoff across closes that come at once
  Goal (finding 6):
  - `listen_forever` (`events.rs:54-57`) resets `retry` to 1 s after a close only when the socket delivered heads,
    or stayed open for `SILENT_FOR` (75 s).
    After a shorter socket the wait doubles, as after `Unreachable`, up to 60 s.
  - A close still fires a cycle (`events.rs:121-123`).
    With the wait doubling, a socket closed at once costs one cycle per wait, not one per second.
  - `PROTOCOL.md` §Events (line 962): the wait resets once a socket delivered heads or stayed open 75 seconds.
  - Implementation reset the wait only after a frame past a socket's first, a ping or a nudge.
    The server sends the heads as every socket's first frame, so "delivered heads" held for every socket.
    The server's ping every 30 seconds stands in for staying open 75 seconds, with no second timer.
  Constraints:
  - A retarget still reconnects at once and resets the wait.
  Done when:
  - an events test: a server that closes every socket as soon as it opens sees reconnects after 1, 2, then 4 s
    (`ManualTimer` sleeps);
  - an events test: a socket that delivered a nudge, then closed, reconnects after 1 s;
  - `bun run check:push` green.
  Commit: Keep the events socket's backoff across closes that come at once
  Depends on: none

- [x] 9. Drop the reply a refused events upgrade carried
  Goal (finding 10):
  - `Opened::Refused` (`transport.rs:80-84`) becomes a unit variant.
  - `HttpTransport::listen` (`transport.rs:191-192`) returns it without reading the body.
    A refusal whose body fails to read then still starts its cycle.
  - `events.rs:97` and the test transport (`tests/engine/common.rs:801`, `:841`) use the unit variant.
  Constraints:
  - `agents/BACKWARDS-COMPATIBILITY.md`: no unused surface and no shim.
  Done when:
  - `grep -rn "Opened::Refused" crates/koloda-sync apps/electron/src-rust` finds no reader of a body;
  - `a_refused_upgrade_starts_one_cycle_and_retries_with_backoff` passes;
  - `bun run check:push` green.
  Commit: Drop the reply a refused events upgrade carried
  Depends on: none

- [x] 10. Pin the runner backoff and the lease and restore caps in tests
  Goal (finding 9):
  - A `ManualTimer` runner test: three cycles get no reply, then one succeeds.
    The runner sleeps 1, 2, then 4 s, then `POLL`; a later failure waits 1 s again.
  - A bootstrap test at `MAX_LEASES` (3, `bootstrap.rs:58-67`).
    With two lapsed leases the bootstrap finishes on the third.
    With three, the cycle fails `lease_expired`, and the next trigger bootstraps again.
  - A restore test at `MAX_RESTORES` (3, `engine.rs:389-399`).
    A cycle that meets three restores finishes.
    One that meets a fourth stops with that restore applied, and the next cycle finishes.
    If the harness cannot land a restore during a cycle, add that hook in `tests/engine/common.rs`.
  Constraints:
  - Tests only.
    If one exposes a bug, stop and record it under Open questions.
  Done when:
  - the new tests pass, and each fails with its constant or reset changed (checked by hand once);
  - `bun run check:push` green.
  Commit: Pin the runner backoff and the lease and restore caps in tests
  Depends on: 3 (it changes which errors back off)

- [x] 11. Say a re-attach's claim records without a skew check
  Goal (finding 2, per question 1):
  - `PROTOCOL.md` §Skew guards (lines 621-624): the check covers a claim that enrolls the file and a space creation.
    Both reserve backfill stamps on the local clock.
  - A re-attach's claim records without it: it reserves no backfill stamps.
    The cohorts it re-stamps stay `local`, so the next cycle's skew pause re-stamps them again.
  Constraints:
  - Docs only; `reattach` (`pairing.rs:214`, `:244-257`) is unchanged.
  Done when:
  - the section matches `join`, `create_space`, and `reattach`;
  - `bun run check:push` green.
  Commit: Say a re-attach's claim records without a skew check
  Depends on: none

## Outcome

Every finding of the audit is settled: 1 and 3 to 11 are fixed, and 2 is settled by narrowing `PROTOCOL.md`.
Nothing was skipped or left for a decision.

Shipped, one Plan item per commit:

- 1: client migration `V16` records why a file detached (`revoked` or `pair_again`).
  The status reads it, so "pair again" outlives later cycles and a relaunch.
- 11: `detach` revokes through `call_across_restore`, now in `restore.rs`.
  A file holding an authoritative restore leaves with its rows and its hold, and a re-attach meets the hold again.
- 5: `Detached`, `NotEnrolled`, `RestoreHeld`, `UnknownDevice`, `Revoked`, and `PairAgain` make the runner wait
  for a trigger, with no poll, no backoff, and no `Error` event.
  An unknown device opens no events socket.
- 4: `SyncError::Transport` carries the status of a reply that is not a sync reply.
  An upload refused with such a `4xx` defers while the other images go on; pushes still count it as lost.
  The server README states the 16 MiB proxy body limit.
- 3: a fork keeps the old device's token; the engine harness gained `copy_beside`, a copy sharing the secret store.
- 7: a re-bootstrap heartbeats its lease before the absence cleanup, and the heartbeat and the release use
  `device_client`, outside the tick budget.
- 8: `tick` reports `is_done: false` when the rounds ran out or transfers are still due.
- 6: the socket's reconnect wait resets only after a socket that delivered a frame past its first.
- 10: `Opened::Refused` is a unit variant, and `HttpTransport::listen` no longer reads the refusal's body.
- 9: tests pin the runner's error backoff, `MAX_LEASES`, and `MAX_RESTORES`.
- 2: `PROTOCOL.md` §Skew guards says a re-attach's claim records without a skew check.

Deviation from the Plan text, recorded in item 8: the server sends heads as every socket's first frame.
So "delivered heads" would have reset the wait for every socket; a later frame, a ping or a nudge, resets it instead.
In item 1 the stored reason replaced the report's "keep the stop on a `Detached` cycle".
Self-review added one docs commit that states when the socket opens again after an unknown device.

Checked: `bun run check:push` passed on every item's tip and on the final tip.
`cargo test -p koloda-sync` runs 166 tests, up from 153.
`cargo test -p koloda-electron` and `bunx nx test @koloda/db-sqlite` passed.
Each new test failed with its fix reverted, checked by hand once.

Not checked, for the human (desktop):

- After a restore from a backup that predates this desktop, Settings → Sync asks to pair again, also after a minute
  and after a relaunch.
- After `koloda-server restore <backup> --authoritative --yes`, "Leave the space" works while the restore waits, and
  the cards stay.
- After leaving, the main-process log shows no sync error every minute.

Follow-ups noticed: `koloda`'s `due_transfers` reads every due queue row per call (Scope), for a `koloda` sync audit.
