# Sync follow-ups and conformance gaps

Status: ready

## Intent

Close what earlier sync tasks left open before the desktop UI exposes it.
`sync-holds` and `sync-recovery` noticed four problems and fixed none of them:

- A `fixed` cohort stamped more than 5 minutes ahead is resent and refused with `stamp_ahead` on every cycle.
  The refusal ends the cycle before its pull, so the device also stops receiving until wall time reaches the stamp.
- An upload answered `507` keeps its backoff, up to 6 hours, after the space has room again.
- A header with a key this app does not know counts as corrupt, not `update_required`.
  The status then points at the operator instead of an app update.
- On a space with a quota, every device call, push, bootstrap, and upload sums the size of every attachment.

The proposal's conformance list (`tmp/explorations/SYNC-ENGINE-PROPOSAL.md` §16, phase 1, item 7) was checked
against the crate tests on 2026-10-09.
Every scenario has a test except two:

- algorithm repair racing a template edit on the same deck;
- client and server ENOSPC during a 20M-review deck delete.

The encoder scenario is covered at the codec level (`a_payload_that_does_not_survive_the_round_trip_fails_the_seal`).
Capture seals inside the local transaction, so a failed seal fails the write.

Done when:

- a cohort a lost push left stamped ahead goes out within a cycle or two of a corrected clock (question 2);
- a device keeps pulling while a push waits for server time;
- an upload refused for room goes up on the first cycle after the space has room;
- an envelope whose header carries an unknown key holds its lane with `update_required`;
- a quota check reads a stored attachment total instead of summing every attachment;
- a server that runs out of disk mid-push answers `507` and consumes nothing (question 4);
- tests cover both missing conformance scenarios;
- `bun run check:push` is green and runs the new tests.

## Scope

In:

- `koloda-sync`: the cycle's handling of `stamp_ahead` for `fixed` cohorts and a status for a push waiting on
  server time; deferred uploads released when the record shows room.
- `koloda`: the outbox and attachment-queue functions those need.
- `koloda-sync-proto`: a decode error for an unknown frame or header key.
- `koloda-server`: a stored attachment total (space migration `V5`), disk-full answered as `507`, and a page cap in
  `Storage` for tests.
- Tests for the two uncovered conformance scenarios.
- `PROTOCOL.md` and the crate READMEs, each with the item that makes them true.

Out:

- NAPI `cmd_sync_*`, Settings → Sync, the join wizard, and the sync product spec (the desktop UI task, last).
- Chunked deletes.
- A separate conformance suite: each scenario stays in the crate tests that hold it.
- The client half of the ENOSPC scenario (question 4).
- The web host and mobile.

## Open questions

The owner took every recommendation on 2026-10-09.

- [x] 1. Area guides?
  Answer: as for `sync-holds`.
  That is `agents/TASKS.md`, `agents/IMPLEMENTATION-PLAN.md`, `agents/MARKDOWN.md`, `agents/CODE-DOCUMENTATION.md`,
  `agents/CODE-STYLE.md`, `agents/TESTING.md`, `agents/RUST.md`, `agents/DB.md` (item 4 adds a space migration),
  and `agents/REVIEW.md` for self-review.
  Also `crates/koloda/README.md`, `crates/koloda-sync/README.md`, `crates/koloda-server/README.md`,
  `crates/koloda-sync-proto/PROTOCOL.md` and its README, and `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`.
- [x] 2. What happens to a `fixed` cohort a push refuses with `stamp_ahead`?
  A cohort is `fixed` in two cases.
  A push carrying it got no complete reply, so a member may have been consumed.
  Or a member is known consumed (`has_consumed`): a switch remainder, a released hold, or a heal re-push.
  Re-stamp walks only `local` cohorts, so today neither case ever changes stamp, and both are refused every cycle.
  Answer: re-stamp the ones never consumed, and let the others wait.
  - A cohort with no consumed member, every member's seq above the `last_sender_seq` of this round's device record,
    returns to `local` and leaves flight.
    The cycle's one re-stamp then takes it.
    The record proves the server never consumed those seqs.
    A late copy of the lost push is refused `stamp_ahead` too, or, once acceptable, meets the re-stamped push as
    `seq_reused`, which forks as today.
  - A cohort with a consumed member keeps its stamp.
    Pushing waits until server time reaches the stamp minus the tolerance.
    Pulls go on, and the status shows when pushing resumes.
    Only a server clock set back makes such a stamp ahead.
  The alternatives were that every `fixed` cohort waits, which blocks pushing for as long as the clock was ahead, or
  the re-stamp alone, which leaves a cohort with a consumed member refused every cycle.
- [x] 3. Does the attachment total move by trigger or in code?
  Three places insert or delete `attachments` rows: upload, collection, and the backup dropping a row whose file a
  collection removed meanwhile.
  Answer: two SQLite triggers on `attachments`, created by the migration.
  No writer can miss the total, and the backup's `VACUUM INTO` copy carries the triggers.
  The proposal's rejection of triggers is about client capture, which needs app-level meaning; a sum needs none.
  The alternative adjusts the total in each writer's transaction, which a future writer must remember.
- [x] 4. How is "client and server ENOSPC during a 20M-review deck delete" covered?
  The server's reserve watermark already refuses every push below 64 MiB free, and that is tested.
  A delete above the reserve that outgrows the disk mid-transaction rolls back and answers `500 internal` today.
  Answer: the server half, scaled down.
  - SQLite's disk-full error, and an attachment write that fails for lack of space, answer
    `507 insufficient_storage`.
  - `Storage` gains a cap on each space file's pages (`PRAGMA max_page_count`), off by default with no `serve` flag.
    Tests use the cap to fill a space.
  - The client half stays out.
    A full disk on a device fails the write in SQLite's WAL, which a page cap does not imitate.
    Capture is in the same transaction as the delete, so the rollback takes both.
  The alternatives were both halves, where the client test passes for the wrong reason, or neither.

## Plan

- [x] 1. Stop resending a fixed cohort the server refuses as ahead
  Goal (per question 2):
  - After a push refused with `stamp_ahead`, the engine finds the `fixed` cohorts stamped more than
    `SKEW_TOLERANCE_MS` ahead of server time, which is local now plus the skew estimate.
  - A cohort with no consumed member, whose every pending row's seq is above this round's record
    `last_sender_seq`, returns to `local` and its rows leave flight.
    The cycle's one re-stamp per cycle then moves it, and the push goes again.
  - A cohort with a consumed member keeps its stamp.
    Pushing waits until server time reaches the stamp minus the tolerance, as a metered push hold does.
    The cycle still pulls both lanes.
    `Status` shows the local time pushing resumes; the first cycle at or after it pushes.
  - A `stamp_ahead` refusal no longer ends the cycle before its pull.
  - `PROTOCOL.md` §Cohorts and §Push outcomes, and the engine README, state the rules.
  Constraints:
  - Re-stamp is unchanged and walks only `local` cohorts.
  - A cohort is never split, and a cohort with a consumed member never changes stamp.
  - The outbox function that returns never-consumed `fixed` cohorts to `local` lives in `outbox.rs` beside
    `push_refused`.
  Done when:
  - a `koloda` integration test shows the outbox function returns only `fixed` cohorts with no consumed member and
    every row above the given seq, and leaves `uncertain` ones alone;
  - an engine test: a push with stamps more than 5 minutes ahead loses its reply, the clock is corrected, and the
    next cycles re-stamp and land the cohort, pulling another device's write meanwhile;
  - an engine test: a cohort with a consumed member, stamped ahead of a server clock set back, waits with the status
    showing when, keeps pulling, and lands at its old stamp once server time allows;
  - `bun run check:push` green.
  Commit: Stop resending a fixed cohort the server refuses as ahead
  Depends on: none

- [x] 2. Hold a header with an unknown key as needing an update
  Goal:
  - `Envelope::decode` and `Header::decode` report a frame or header map with a text key this app does not know as a
    new `EnvelopeError` variant naming the part and the key, instead of `Malformed`.
  - Apply's `unreadable` maps it to `HoldReason::UpdateRequired`.
  - A payload with an unknown key stays corrupt, since a new payload key comes with a schema raise.
  - The server refuses such a push as it does today.
  - `PROTOCOL.md` §Envelope encoding and §Corrupt envelopes say so.
  Constraints:
  - No change to any accepted encoding, digest, or golden fixture.
  - A header that decodes is decoded once; the key check runs only after the typed decode fails.
  Done when:
  - proto tests: an extra header key and an extra frame key decode to the new error; a known key with a wrong type
    stays `Malformed`;
  - a `koloda` holds test: a `hot` entry whose header has an unknown key holds with `UpdateRequired`, and a snapshot
    page stops at it;
  - `bun run check:push` green.
  Commit: Hold a header with an unknown key as needing an update
  Depends on: none

- [x] 3. Retry deferred uploads as soon as the space has room
  Goal:
  - When the device record shows room, every deferred upload becomes due at once with its attempts reset.
    This runs beside `release_held` in the cycle.
  - Uploads defer only on `507`, so these are exactly the uploads that waited for room.
  - `PROTOCOL.md` §Attachments and the engine README say so.
  Constraints:
  - The `koloda` function lives in `repo/sync/attachments.rs` beside `defer_transfer`.
  - Fetch backoff is unchanged.
  Done when:
  - a `koloda` integration test: the release resets deferred uploads only, and leaves fetches and first attempts alone;
  - an engine test: an upload refused for room goes up in the first cycle after the quota is raised, with no clock
    advance;
  - `bun run check:push` green.
  Commit: Retry deferred uploads as soon as the space has room
  Depends on: none

- [x] 4. Keep a running total of each space's attachment bytes
  Goal:
  - Space migration `V5__attachment_bytes.sql` adds `space.attachment_bytes`, filled from the current sum.
  - The total moves with every insert and delete of an `attachments` row, by the means question 3 picks.
  - `quota.rs` `usage` reads the total.
  Constraints:
  - `agents/DB.md` for the migration.
  - What counts as usage does not change.
  Done when:
  - server tests: the total equals the sum after an upload, a repeat upload of the same id, a collection, and in a
    backup copy that dropped a row;
  - an existing quota test still holds a write once uploads pass the quota;
  - `bun run check:push` green.
  Commit: Keep a running total of each space's attachment bytes
  Depends on: none

- [ ] 5. Answer a server out of disk with 507
  Goal (per question 4):
  - SQLite's disk-full error, and an attachment file write that fails for lack of space, answer
    `507 insufficient_storage` instead of `500 internal`.
  - A push that runs out of disk mid-transaction consumes nothing, as any refused push.
  - `Storage` gains a cap on each space file's pages, applied as `PRAGMA max_page_count` when a space opens.
    It is off by default, and `serve` has no flag for it.
  - `PROTOCOL.md` §Quotas and the server README state the `507`.
  Constraints:
  - The router and every handler's success path stay as they are.
  Done when:
  - a server test: a deck delete into a space capped below what it needs is refused `507` and leaves log, heads, and
    fences unchanged; with the cap lifted the same push applies;
  - an engine test: the device keeps the delete pending through the refusal and lands it once the cap lifts;
  - `bun run check:push` green.
  Commit: Answer a server out of disk with 507
  Depends on: none

- [ ] 6. Test algorithm repair racing a deck's template change
  Goal:
  - A deletes an algorithm with a successor, so its deck's `algorithm` pointer repairs to the successor.
  - Meanwhile B changes the same deck's template.
  - Both replicas end with the successor and B's template.
  Constraints: test only, in `sync_repair_integration_tests.rs`.
  Done when: the test passes; `bun run check:push` green.
  Commit: Test algorithm repair racing a deck's template change
  Depends on: none

## Outcome

<what shipped>
