# Sync engine audit fixes

Status: ready

## Intent

Settle every finding of the sync engine audit, and every follow-up `sync-review-fixes` left, before the desktop UI.
Settled means fixed, or decided with the decision written in `PROTOCOL.md` and in this file.
The audit read `3d7493a2`, a pre-rebase copy of `68247e73`, against `crates/koloda-sync-proto/PROTOCOL.md`.
Its report is `tmp/audits/sync-engine.md`, which git ignores, so this file carries everything the plan needs.
The owner and the agent checked it against `main` at `894e11d5` on 2026-10-09.

Findings, numbered as in the report (R risk, I improvement, P product decision), then the follow-ups (F):

- R1. The server's `heads` has no index on `(lane, seq)`, so every join of `versions` to `heads` scans `heads`.
  - On `space/V1__space.sql` with 300k heads, one 500-row pull page took 14.5 s, and under 1 ms with the index.
  - `end_lease` is quadratic and runs under the writer lock, from push, bootstrap, and revoke.
- R2. A bootstrap under a bounded `tick` opens a new lease and streams from position 0 on every tick.
  - A snapshot larger than one tick's budget never finishes.
  - The report's lease leak and `429` do not happen: `open_lease` ends the caller's earlier lease first.
  - `Engine::tick` has no host caller yet.
- R3. The client's renumbering loops update `sync_stamps`, `sync_origins`, and `sync_tombstones` by
  `(sender, sender_seq)`, which no index covers.
  - That is one full scan per table per moved row, in `switch.rs` `renumber`, `heal.rs` `move_cohort`, and
    `outbox.rs` `release_held`.
  - A fork with 2,000 pending rows on a large file takes minutes in one transaction.
  - `sync_outbox` lookups by `commit_id` are unindexed too.
- R4. A payload that decodes but breaks a domain rule fails the whole page in `apply.rs`.
  - Cases: a review whose `validate()` fails, a rating out of `i32`, a learning value that is not JSON.
  - The engine retries the page forever, and the status gives no `lane` and `seq` for `drop-envelope`.
- R5. `cohorts` in `outbox.rs` reads every outbox row and finds its cohort by linear search.
  After a large import, every push is quadratic in the outbox.
- R6. `remint` in `join.rs` collects every id of every table, and every review id of each reminted card, first.
  An Add of a full copy of a large file holds about 20M id pairs in memory.
- R7. `create_space` and `join` enroll, which reserves backfill stamps on the local clock, before any skew check.
  A clock ahead yields backfill cohorts the space refuses `stamp_ahead` until server time catches up.
- R8. Every device call writes `devices.last_seen`, and every pull page writes a cursor, to `server.db`.
  A pull page is two write transactions on the one shared connection, serialized across every space.
- R9. Receipts are never collected: one row per envelope ever pushed, about 1.4 GB at 20M reviews.
- R10. The pairing preview sums every version's bytes and counts every head on the space's one reader connection.
  Pulls of that space wait behind it.
- R11. A transfer the server answers `5xx` ends the cycle's transfers and is first again next cycle.
  One blob the server cannot serve blocks every image.
- R12. A heal step's candidate query visits the whole product table when nothing is above the cutoff.
  `heal_step` moves through every step in one call, so one transaction can scan every table.
- I1. No sync test runs above a few hundred rows, so R1 and R3 are invisible to CI.
- P1. Opening a lease inserts one `lease_items` row per live head, under the writer lock.
- P2. A file attached to one space can join another.
  The join claims, then `begin_import` clears the outbox.
  Writes pending for the first space never reach it, and its device record stays.
- P3. A large delete cascades in one push transaction; `PROTOCOL.md` already names chunked deletes as later.
- F1. A blank join seeds its settings and enrolls in two transactions.
  - A stop between them leaves settings rows and no seed rows.
  - The retry reads a used file and asks for Add or Replace.
  - An abandoned join is worse: `get_db_status` reports `ok`, so the first-run seed never runs.
    The file has no algorithm, no template, and learning defaults that name ids it does not hold.
- F2. A detach whose token delete fails leaves the old token in the secret store after the re-attach.
  - Detach and `finish_enrolling` delete secrets after their commit, and fail the call when the delete fails.
  - A detach that did detach, or a join that did join, then reports an error.
- F3. Found in the check of F1: an untouched-seed join commits `begin_import`, probes over the network, then adds.
  A failed probe leaves the file `import_pending`, and the host asks for Add or Replace.
  `PROTOCOL.md` §Joining says such a file joins without asking.

Done when:

- a pull page, `end_lease`, and the other `heads` joins search an index, and a test fails if one scans;
- fork, heal, and held release renumber by primary key, and a test fails if one scans;
- a heal call scans a bounded number of rows, whatever the cutoff;
- a payload that breaks a domain rule holds its lane at its seq, and `drop-envelope` clears it;
- a push groups cohorts, and an Add remints, in memory bounded by a batch or a chunk, not by the file;
- an enrollment with the clock outside the tolerance stops before it reserves stamps, and finishes once it is back;
- the server writes `last_seen` and cursors only when they move;
- the pairing preview reads counters, not the log;
- one image the server fails on no longer holds back the others;
- a file attached to another space is refused before the claim;
- an interrupted blank join retries as blank, and an abandoned one opens to the first-run seed;
- an interrupted untouched-seed join finishes its Add without asking;
- a failed secret delete after a commit reports success, and a re-attach leaves no old token behind;
- `PROTOCOL.md` states what v1 accepts for R2, P1, and R9;
- `bun run check:push` is green and runs the new tests.

## Scope

In:

- `koloda-server`: space migrations `V6` (heads indexes) and `V7` (preview counters), pull, auth, the preview.
- `koloda`: client migration `V14` (`sync_outbox (commit_id)`), renumbering, cohorts, heal scan, apply decode,
  remint, join mode, the blank-join seed.
- `koloda-sync`: enrollment skew checks, transfers on `5xx`, the attached-elsewhere refusal, the cycle's Add for an
  untouched seed, secret cleanup after a commit, re-attach.
- `koloda-sync-proto`: `PROTOCOL.md` and a conformance case for R4.
- The crate READMEs and `agents/RUST.md`, each with the item that makes them true.

Out:

- R2's resumable bootstrap: deferred to the mobile host (question 2).
- P1's pin-by-seq redesign (question 5).
- R9's receipt collection (question 4).
- P3's chunked deletes, already "may later" in `PROTOCOL.md`; nothing to change.
- The two smaller decisions of `sync-review-fixes`: the authoritative reset keeps `sync_enrolling`, and a fork leaves
  a claim pending for another space alone.
  After item 8, no new claim can be pending for another space while the file is attached.
- NAPI `cmd_sync_*`, Settings → Sync, the join wizard, the web host, and mobile.

## Open questions

The owner took every recommendation on 2026-10-09.

- [x] 1. Area guides?
  Answer: the set proposed, as for `sync-review-fixes`.
  `agents/TASKS.md`, `agents/IMPLEMENTATION-PLAN.md`, `agents/MARKDOWN.md`, `agents/CODE-DOCUMENTATION.md`,
  `agents/CODE-STYLE.md`, `agents/TESTING.md`, `agents/RUST.md`, `agents/DB.md` (items 1, 2, and 13 add
  migrations), `agents/BACKWARDS-COMPATIBILITY.md` (item 5 changes what holds), and `agents/REVIEW.md` for
  self-review.
  Also the four crate READMEs and `crates/koloda-sync-proto/PROTOCOL.md`.
- [x] 2. R2: how does a device that only ticks bootstrap?
  Answer: deferred to the mobile host; item 15 states the limit in `PROTOCOL.md` §Bootstrap.
  - Resuming a lease across ticks needs ticks closer together than `LEASE_TTL_MS` (5 minutes).
    Mobile background ticks are usually further apart, so the lease would lapse anyway.
  - Options for the mobile task: a longer TTL for a ticking device, pin-by-seq (P1), or bootstrap only in unbounded
    runs.
  - The report's "release on `BudgetSpent`" could not work: `release` goes through `cycle_client`, which refuses a
    request once the budget is spent.
- [x] 3. R3 and R12: an index on `(sender, sender_seq)`?
  Answer: no.
  - R3 renumbers through the primary key: every moved row knows its `kind` and `id`, the key prefix of all three
    tables.
  - R12 bounds the rows a heal call scans instead of driving the scan from an index.
  - The index would hold one entry per review in `sync_origins`, hundreds of MB at 20M reviews, kept on every apply.
  - `sync_outbox (commit_id)` is indexed: the outbox drains, so that index stays small.
- [x] 4. R9: collect receipts, or keep them for v1?
  Answer: keep them for v1; item 15 says so in `PROTOCOL.md`.
  - Collecting needs a protocol rule for a replay below the kept floor.
    There the server can no longer tell a same-digest retry from a reused seq.
  - Receipts are about 1.4 GB at 20M reviews by the report's estimate, beside a log several times that.
- [x] 5. P1: pin leases by seq?
  Answer: not in v1; `lease_items` stays, and item 15 states its cost in `PROTOCOL.md` §Bootstrap.
- [x] 6. P2: what does a join do on a file attached to another space?
  Answer: refuse before the claim, as re-attach refuses an attached file; the user detaches first.
  The alternative revoked the old device inside the join and refused while writes were pending.
- [x] 7. F3: who finishes an untouched-seed join's Add after a failed probe?
  Answer: the cycle, since such a file never asks; the status does not show `ImportPending` for it.
  The alternative reported the mode in the status for the host to pick Add.
- [x] 8. F2: is a failed secret delete after the commit an error?
  Answer: no; it emits `Event::Error` and the call succeeds, and a re-attach removes the old device's token too.
- [x] 9. I1: how do tests guard scale?
  Answer: by a deterministic measure, the query plan or SQLite VM steps, never wall time.
  A timing bound near the unindexed cost is thin, and seeding 100k rows costs seconds per run.

## Plan

- [x] 1. Index the space's heads by version
  Goal (R1, I1):
  - Space migration `crates/koloda-server/src/migrations/space/V6__heads_indexes.sql` adds
    `heads_version ON heads (lane, seq)` and `heads_lane_grp ON heads (lane, grp)`.
  - Implementation made `heads_lane_grp` `(lane, grp, seq)`.
    With `(lane, grp)` the planner served a collection pass from `heads_version`, reading every `hot` head below the
    bound; with `seq` it reads only the tombstones.
  - The test is a unit test in `src/heads_index_tests.rs`: the statements are private to the crate.
  - Queries that must search one of them instead of scanning `heads`:
    - the pull page read in `pull.rs`;
    - `end_lease`, the reviews of a cascaded card, `cascade_counts`, `live_children`, and `collect_tombstones` in
      `log.rs`;
    - the `lease_items` insert of `open_lease` in `bootstrap.rs`;
    - the head reads in `drop_envelope.rs`.
  - A server test on a migrated space asserts that none of them scans `heads`.
    It reads the query plan, or counts SQLite VM steps through a progress handler on a few thousand seeded heads.
    Make each statement reachable from the test, for example as a `pub(crate) const`.
  - The server README lists the indexes.
  Constraints:
  - `agents/DB.md` rules for a new migration: never edit an applied one, `IF NOT EXISTS`.
  - No query text changes beyond what the test needs to reach it.
  Done when:
  - the new test passes, and fails with `V6` removed (checked by hand once);
  - `bun run check:push` green.
  Commit: Index the space's heads by version
  Depends on: none

- [x] 2. Renumber a device's seqs through the primary key
  Goal (R3, I1, per question 3):
  - `renumber` in `switch.rs`, `Writer::move_cohort` in `heal.rs`, and the pending loop of `release_held` in
    `outbox.rs` read `kind` and `id` with each outbox row they move.
  - Their `UPDATE`s of `sync_stamps`, `sync_origins`, and `sync_tombstones` add `kind = ? AND id = ?`, so each
    searches the table's primary key.
  - Client migration `V14__sync_outbox_commit.sql` adds `sync_outbox_commit_id_idx ON sync_outbox (commit_id)`.
    It serves `delete_empty_cohort`, `push_refused`, `unfix_unconsumed`, and `move_cohort`.
  - A `koloda` test asserts that none of these statements scans its table, as item 1's test does.
  - Implementation confirmed the constraint below: every writer stamps under the envelope's own `kind` and `id`.
    The three loops share one `renumber_row` in `repo/sync/mod.rs`; the test is a unit test in
    `repo/sync/index_tests.rs`.
  Constraints:
  - First confirm that every writer of an own-device stamp, origin, or tombstone writes it under the envelope's own
    `kind` and `id`: capture, backfill, restamp, held release, heal, and apply.
    If one does not, stop and record it under Open questions; the fallback is the `(sender, sender_seq)` index.
  - `agents/DB.md`: refresh `mod.rs`, regenerate `schema-inventory.json`, run `bunx nx test @koloda/db-sqlite`.
  - Fork, heal, and quota-release behavior is unchanged.
  Done when:
  - the new test passes;
  - the fork, heal, and held-release tests in `koloda` and `koloda-sync` pass unchanged;
  - `bun run check:push` green.
  Commit: Renumber a device's seqs through the primary key
  Depends on: none

- [x] 3. Group the outbox into cohorts in SQL
  Goal (R5):
  - `cohorts` in `outbox.rs` reads one row per cohort, grouped by `commit_id`, with what `push_batch` chooses by.
  - `push_batch` then reads the seqs of the cohorts it sends, not every outbox row.
  - Its choice is unchanged: in-flight cohorts first, then by lowest seq, within the batch limits.
  Constraints:
  - Memory and work per push are bounded by the batch, not by the outbox.
  Done when:
  - a `koloda` test: an outbox of many cohorts, some in flight, yields the same batches as before;
  - the push tests pass unchanged;
  - `bun run check:push` green.
  Commit: Group the outbox into cohorts in SQL
  Depends on: 2

- [x] 4. Bound the rows a heal call scans
  Goal (R12, per question 3):
  - `candidates` in `heal.rs` scans a window: at most a fixed number of rows after `after`, in id order.
    It returns the matches and the last id scanned.
  - `heal_step` advances `after` to the last id scanned, even when nothing matched.
    It returns `Heal::Pending`, through `writer.finish`, once one call has scanned its cap.
  - A step ends only when its window scans no row.
    The learning and tombstone steps window the same way.
  Constraints:
  - Order and output are unchanged; a batch still never splits one entity's writes.
  - Resuming across calls stays on `heal_step` and `heal_after_id`.
  Done when:
  - a `koloda` test: a heal over many rows with nothing above the cutoff takes several calls, each within the cap,
    and finishes;
  - the heal tests pass unchanged;
  - `bun run check:push` green.
  Commit: Bound the rows a heal call scans
  Depends on: none

- [x] 5. Hold the lane on a payload that breaks a domain rule
  Goal (R4):
  - `decode` in `apply.rs` also runs the domain checks applying would fail on.
    That covers `review_data` and `validate()` for a review, and the JSON parse of a learning value.
    It also covers any other `?` on a domain conversion of payload fields inside apply.
  - A failure answers `HoldReason::CorruptEnvelope`, so the lane holds at that seq and the status shows it.
  - A conformance case: a review with an out-of-range rating holds `cold`.
  - `PROTOCOL.md` §Corrupt envelopes: a payload that decodes but breaks a domain rule is corrupt.
  - Implementation folded the conformance case into the `koloda` corrupt-review table in
    `sync_holds_integration_tests.rs`, and deleted `a_remote_review_outside_the_review_bounds_fails_its_page`, which
    pinned the old page failure.
  Constraints:
  - `decode` writes nothing.
  - No wire change (`agents/BACKWARDS-COMPATIBILITY.md`).
  Done when:
  - the conformance case passes;
  - an engine test: a raw review with an invalid rating, pushed as the corrupt-envelope tests push, holds the other
    device's `cold` lane at its seq, and `drop-envelope` of it lets the lane move on;
  - `bun run check:push` green.
  Commit: Hold the lane on a payload that breaks a domain rule
  Depends on: none

- [x] 6. Seed a blank joiner and enroll it in one transaction
  Goal (F1):
  - The blank path of `join` in `pairing.rs` seeds settings and enrolls in one transaction.
  - `seed_joiner_db` in `app/init.rs` and `enroll_device` in `repo/sync/mod.rs` each gain a form that takes the
    transaction.
  - A stop before that commit leaves the file blank, with its claim pending in `sync_enrolling`.
    The next join with the same code joins it as blank, on the same device.
  - Implementation replaced `seed_joiner_db` with `seed_joiner`, since only tests called the database form after it;
    `enroll_device` keeps its form beside `enroll` for space creation.
  Done when:
  - an engine test: a blank join whose enrollment fails leaves no settings rows, and `get_db_status` reports blank;
    the next join with the same code joins as blank on the same device.
    A test-only SQLite trigger that aborts the `sync_state` insert once is one way to fail it.
  - `bun run check:push` green.
  Commit: Seed a blank joiner and enroll it in one transaction
  Depends on: none

- [x] 7. Finish an interrupted untouched-seed join without asking
  Goal (F3, per question 7):
  - A cycle that finds the file `import_pending` with only the untouched first-run seed runs Add, as
    `import(ImportMode::Add)` does, then continues.
    That means the probe, then `add_to_space`.
  - `holds_only_untouched_seed` in `join.rs` is what decides it.
  - The status shows `ImportPending` only for a file that needs the host's choice.
  - Any other file still waits for the host.
  - `PROTOCOL.md` §Joining: an untouched-seed join interrupted after its claim finishes its Add on the next cycle.
  Constraints:
  - The join itself still runs Add right away; the cycle only finishes what a failed probe left.
  - Implementation: the join holds the cycle lock from recording the claim through Add, so a runner cycle cannot run
    the same Add beside it. `SyncState::is_seed_import` tells the cycle and the status apart from a used file.
  Done when:
  - an engine test: an untouched-seed join whose probe fails by transport leaves `import_pending`; the status does
    not show `ImportPending`, and the next cycle adds, bootstraps, and syncs;
  - a used file left `import_pending` still waits for `import`;
  - `bun run check:push` green.
  Commit: Finish an interrupted untouched-seed join without asking
  Depends on: none

- [x] 8. Refuse a join while the file is attached to another space
  Goal (P2, per question 6):
  - `join_mode` reports a file active in another space as its own mode.
  - `join` refuses it with `CannotJoin` before it writes `sync_enrolling` and before the claim.
    The code stays usable by another device.
  - A file detached from another space joins as a used file, as today.
  - `PROTOCOL.md` §Joining: the mode table gains the attached row, and "from another space" becomes a file
    detached from another space.
  - The engine README states the refusal.
  Done when:
  - an engine test: a file attached to space A is refused a join to space B, writes nothing, and the code then
    claims from another device;
  - after detaching from A, the same file joins B as a used file;
  - `bun run check:push` green.
  Commit: Refuse a join while the file is attached to another space
  Depends on: none

- [x] 9. Report a failed secret delete after a commit without failing the call
  Goal (F2, per question 8):
  - `detach_locally`: once `detach` has committed, a failed delete of the token emits `Event::Error` and returns
    `Ok`.
  - Every caller of `finish_enrolling`: once the enrollment has committed, a failed delete of
    `sync.pending_token.{nonce}` emits `Event::Error`, and the call succeeds.
  - `reattach`: after `switch_device` commits, it deletes `token_key(old)` as well, best effort.
  - Implementation: one `forget_secrets` does every such delete, and a fork's deletes after its switch use it too.
  - The engine README and the Detach note in `agents/RUST.md` state the rules.
  Constraints:
  - A secret operation before a commit still fails its call.
  Done when:
  - engine tests with `MemorySecrets::refuse_next`:
    - a detach whose token delete fails returns `Ok` and emits the error, and the re-attach removes the old token;
    - a join whose pending-token delete fails returns `Ok`;
  - `bun run check:push` green.
  Commit: Report a failed secret delete after a commit without failing the call
  Depends on: none

- [x] 10. Check skew before an enrollment reserves stamps
  Goal (R7):
  - `create_space` in `engine.rs`, and `join` in `pairing.rs` on its blank and used paths, call `check_skew()`
    after the enrollment reply and before `enroll_device` or `begin_import`.
  - A skew stop leaves the claim or creation pending in `sync_enrolling`.
    The next attempt, once the clock is back, finishes on the same device.
  - `PROTOCOL.md` §Skew guards states it.
  - Implementation: the tests set the clock 6 minutes ahead, not an hour.
    Correcting it moves the test server's clock forward, and a jump past 10 minutes outlives the creation's nonce.
  Done when:
  - engine tests: a join and a space creation with the clock an hour ahead stop with `ClockSkew` before enrolling,
    then finish on the same device once the clock is back;
  - `bun run check:push` green.
  Commit: Check skew before an enrollment reserves stamps
  Depends on: 6

- [x] 11. Remint cards and their reviews a chunk at a time
  Goal (R6):
  - `remint` in `join.rs` reads card ids in chunks with a keyset cursor.
    It mints and moves each chunk's cards and their reviews before the next chunk.
  - Algorithms, revisions, templates, and decks stay collected; they are small.
  - Implementation keys the cursor on the rowid, which a remint keeps; a new UUIDv7 sorts after the old ids.
    Cards move before decks, so a card's `deck_id` still names its deck's old id when the chunk is filtered.
  Constraints:
  - Add stays one local transaction, with foreign keys deferred.
  - Memory is bounded by a chunk, not by the file.
  - Result unchanged: the same rows move, and every pointer and learning default follows.
  Done when:
  - the Add tests pass unchanged;
  - a `koloda` test: an Add that remints a deck with more cards than one chunk moves every card and review;
  - `bun run check:push` green.
  Commit: Remint cards and their reviews a chunk at a time
  Depends on: none

- [x] 12. Write a device's last seen and cursors only when they move
  Goal (R8):
  - `auth.rs`: the `devices` update runs only when `last_seen` is a minute or more old, or `rebase_required`
    changes.
  - `record_cursor` in `pull.rs` writes only when the cursor rises.
  - `PROTOCOL.md` §Devices: `last_seen` has a minute's resolution, if the text implies more.
  - Implementation: the test counts updates of `devices` with a test-only trigger.
    An update that leaves the row as it was writes no page, so `PRAGMA data_version` does not see its transaction.
  Constraints:
  - Staleness, at 90 days, reads `last_seen` and is unchanged.
  Done when:
  - a server test: two calls within a minute write `last_seen` once, and a pull page below the stored cursor
    writes nothing;
  - the staleness tests pass unchanged;
  - `bun run check:push` green.
  Commit: Write a device's last seen and cursors only when they move
  Depends on: none

- [x] 13. Keep the pairing preview's counts and bytes in counters
  Goal (R10):
  - Space migration `V7__preview_counters.sql`:
    - `space.version_bytes`, kept by triggers on `versions` insert and delete, as `V5__attachment_bytes.sql` does;
    - a per-kind live count, kept by triggers on `heads`;
      an entity counts while it holds a head outside the tombstone group `''`;
    - both filled from current rows.
  - `log::size` reads only the counters.
  Constraints:
  - Each trigger costs only primary-key lookups.
  - `VACUUM INTO` backups carry the triggers.
  - `agents/DB.md` rules for a new migration.
  Done when:
  - a server test: after pushes, compaction, a cascading delete, `drop-envelope`, and GC, the preview matches what
    the old scan returns;
  - `bun run check:push` green.
  Commit: Keep the pairing preview's counts and bytes in counters
  Depends on: 1

- [x] 14. Defer a transfer the server fails on
  Goal (R11):
  - `upload` and `fetch` in `crates/koloda-sync/src/attachments.rs` defer a transfer the server answers with
    `SyncError::Server` and a `5xx` status, then move to the next.
    `defer` waits 1 minute, doubling up to 6 hours.
  - A transport error still ends the cycle's transfers.
  - Implementation added client migration `V15__sync_attachment_room.sql`: `sync_attachment_queue.is_waiting_for_room`.
    `release_deferred_uploads` resets every deferred upload each round the space has room, so without it an upload
    the server failed on would be sent again every cycle; only a `507` (`defer_for_room`) now marks it.
    The failed transfer emits `Event::Error`, since only a fix on the server ends its waits.
    Four engine tests that used a `500` to stall a transfer now reset the backoff or lose the reply instead.
  Done when:
  - an engine test: the server fails one fetch with a `5xx`, for example a blob file removed from its disk, and
    the other images of the batch arrive that cycle;
  - `bun run check:push` green.
  Commit: Defer a transfer the server fails on
  Depends on: none

- [x] 15. State the sync limits v1 accepts
  Goal (R2, P1, R9, per questions 2, 4, and 5):
  - `PROTOCOL.md` §Bootstrap: a bounded tick that ends mid-snapshot starts over on its next lease.
    A snapshot larger than one tick's budget needs an unbounded run.
  - §Bootstrap: opening a lease lists every live head under the writer lock, at most four leases at a time.
  - Where receipts are defined: they are kept for the life of the space.
  Constraints:
  - Docs only; P3 is already stated.
  Done when:
  - the sentences are in place;
  - `bun run check:push` green.
  Commit: State the sync limits v1 accepts
  Depends on: none

## Outcome

<what shipped>
