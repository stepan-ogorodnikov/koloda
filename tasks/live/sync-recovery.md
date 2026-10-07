# Sync recovery

Status: ready

## Intent

Make a device that falls out of step with its server record recover on its own.
Today a file that is behind its own record stops and says so.
The server never collects tombstones, never marks a device stale, and never tells a device it was left behind.
A detached or revoked file cannot rejoin its space.
`crates/koloda-sync-proto/PROTOCOL.md` §Devices, §Recovery, and §Joining describe the way back; this task builds it
on the server, in `koloda`, and in the engine.

This replaces a first attempt, kept on `ref/sync-recovery-v1` for reference only.
That attempt's task file was rewritten while it was implemented, so its answers are not carried over.
Questions 3 to 8 below re-open the points where it changed the protocol.

Done when:

- a device that stays away past the stale window, or past a tombstone GC that removed deletes it never saw, comes
  back without user action;
  it keeps every write the space still takes, loses what the space deleted, and resurrects nothing;
- a database file restored from a backup, or copied to another machine, forks to a new device by itself;
  it loses no pending write, and a second live copy keeps syncing next to the first;
- a clock that was wrong and is then corrected re-stamps the writes made meanwhile, and they sync;
  every grade's review and scheduling, and every reset and its blank scheduling, still share one stamp;
- a detached or revoked file re-attaches to its space with a new pairing code and keeps its rows and pending writes;
- the server marks stale devices, collects tombstones every active device has passed, and tells a device it left
  behind to re-bootstrap;
- `bun run check:push` is green and runs the new tests.

## Scope

In:

- `koloda-sync-proto`: `cursor_too_old`, `rebase_required` on the device record, and the fork request body.
- `koloda-server`:
  - stale devices, `rebase_required`, and refusing their pushes;
  - tombstone GC in the existing collection pass, GC horizons in every device reply, and `cursor_too_old` on push
    and pull;
  - an idempotent fork.
- `koloda`:
  - re-stamping `local` cohorts as units, and the stable high-water that bounds it;
  - the re-bootstrap barrier, marks, and absence cleanup;
  - switching a file to a new device id: receipts, cohort classification, and renumbering;
  - one migration for the new columns.
- `koloda-sync`:
  - re-bootstrap on `rebase_required` and `cursor_too_old`;
  - recovery of a file that is behind, by fork, re-stamp, and re-bootstrap;
  - re-stamp when a clock pause ends, and once after `stamp_ahead`;
  - re-attach of a detached or revoked file whose space has the epoch the file stored.
- `PROTOCOL.md`, the READMEs, `agents/RUST.md`, and `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`, each with the item
  that makes them true.

Out:

- Server restore: `epoch_changed`, restore points, heal re-push, the authoritative reset, `401 unknown_device`
  recovery, and re-attach to a space with a newer epoch or after rotated tokens.
  Re-attach refuses a newer epoch before it uses the code.
- Corrupt and unknown-schema envelopes, regeneration of `held` envelopes, and `held { quota }`.
- Quotas, disk watermarks, and `507`.
- The events WebSocket, built-in TLS, and the operator commands.
- Chunked delete jobs and logical deletion scopes; deletes still cascade in one transaction.
- Metered-network pauses and the free-disk preflight; re-bootstrap is bulk, but it pauses only once those exist.
- Attachment changes, if question 9 holds.
- NAPI `cmd_sync_*`, Settings → Sync, the join wizard, and a product spec for sync (the desktop UI task, which lands
  last).
- The web host, which does not sync, and mobile.

## Open questions

- [x] 1. Area guides?
  Answer: `agents/TASKS.md`, `agents/IMPLEMENTATION-PLAN.md`, `agents/MARKDOWN.md`,
  `agents/CODE-DOCUMENTATION.md`, `agents/CODE-STYLE.md`, `agents/TESTING.md`, `agents/RUST.md`, `agents/DB.md`,
  and `agents/REVIEW.md` for self-review.
  Also `crates/koloda/README.md`, `crates/koloda-sync/README.md`, `crates/koloda-server/README.md`,
  `crates/koloda-sync-proto/PROTOCOL.md` and its README, and `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`.
- [x] 2. One task, or the server work apart?
  Answer: one task, server items before the engine items that need them.
  The engine cannot be tested against `cursor_too_old` and `rebase_required` without the server's half, which is two
  small items.
- [x] 3. May a re-stamp move the clock backwards?
  `PROTOCOL.md` §Hybrid logical clock says the device "never issues a smaller one".
  A clock set ahead stamps every write made meanwhile ahead, and moves `last_hlc` with them.
  If re-stamp ticks on from `last_hlc`, the new stamps are still ahead and the server keeps refusing them
  (`stamp_ahead`).
  A clock set to a year ahead would never sync again.
  Answer: yes, bounded by a persisted **stable high-water**.
  - `sync_state.stable_hlc` is the highest stamp that is no longer only local.
    Apply raises it to every stamp it observes, and `push_batch` raises it to each cohort it moves out of `local`.
  - Re-stamp issues from `max(corrected now, stable_hlc, the reserved backfill stamps)`, one stamp per cohort in old
    stamp order, and leaves `last_hlc` on the last one issued.
  - So the clock only goes back over stamps that `local` cohorts alone held.
  The first attempt took the floor from the stamps still stored in registers.
  That misses a remote stamp that a later local write replaced in its register.
  If that remote stamp was up to 5 minutes ahead, the re-stamped write could land below it and lose to it.
  Item 1 amends §Hybrid logical clock and §Cohorts.
- [x] 4. How does a re-bootstrap find what the server deleted?
  `PROTOCOL.md` §Re-bootstrap records `pre_barrier_ids`, persists the ids the snapshot inserted, and deletes every
  pre-barrier id still absent.
  That deletes a create made before the barrier that was never sent, and the id sets do not scale to 500k cards.
  Answer:
  - a rebase generation in `sync_state` and a mark on `sync_origins`;
    snapshot and catch-up apply mark every create they meet with the open generation, including duplicates;
  - at the end, every algorithm, template, deck, and card that has a create origin but no mark of this generation is
    absent on the server, unless its create is still in the outbox or held;
  - absent rows are deleted with their descendants, registers, origins, and pending writes, through the path an
    applied tombstone uses, but with no tombstone and no fence;
    pointers to a deleted algorithm or template repair with no successor;
  - reviews follow their card, or die under a pulled reset; revisions and settings are never absent, because they
    have no tombstones;
  - the scan walks keyset batches in one transaction and holds nothing in memory per entity.
  Accepted edge: a create that earlier came back `existence` (a capture bug) has an origin and no pending row, so
  cleanup deletes it.
  Heal re-push, which `existence` waits for, belongs to server restore.
  Item 2 amends §Re-bootstrap and §Client state.
- [x] 5. How does a file that is behind tell its `fixed` cohorts apart, and survive a crash mid-fork?
  A cohort is `fixed` when a member was consumed, and also when a reply was lost and nothing is known.
  Only the first kind keeps its stamp.
  A consumed member that has already left the outbox has no pending seq whose receipt could show it.
  Answer:
  - `sync_cohorts.has_consumed`, set by push settlement and by receipts;
    a `fixed` cohort without it returns to `local` when no receipt shows a member consumed;
  - fork takes a nonce, like space creation and claim, and the same nonce returns the same device and token;
    the engine stores the nonce in `sync_state` before it calls;
    a crash anywhere then forks once, and no orphan record with cursor 0 pins GC for 90 days.
  Item 6 amends §Behind its own record; item 7 amends §Endpoints and §Bodies.
- [x] 6. When is a device stale, and what clears `rebase_required`?
  Answer:
  - a request marks its device stale when the stored `last_seen` is older than 90 days, or older than 24 hours for a
    record another was forked from;
    the check reads `last_seen` before the request refreshes it, and the flag persists;
  - a GC pass reads staleness from `last_seen` itself, so a device that never calls again stops pinning GC;
  - a push from a `rebase_required` device is refused whole with `cursor_too_old`, consuming nothing;
    receipts, pull, the device calls, and bootstrap still answer;
  - releasing a snapshot lease clears the flag, because a device releases only after its snapshot and catch-up are
    applied.
- [x] 7. How does tombstone GC pick what to remove?
  Answer:
  - one pass per space, under the space writer lock, in `Server::collect_garbage` beside attachment collection;
  - it removes tombstone versions and heads at or below the lowest `cursor_hot` of the active devices (not revoked,
    not stale) and the lowest `hot` head of a live lease, which catches up from it, and never a pinned version;
  - the lane's GC horizon is the highest seq a pass removed and never falls;
    `cold` holds no tombstones, so its horizon stays 0;
  - `deleted_ids` is never touched, so a late create of a collected id is still `fenced`;
  - a pull whose `after` is below its lane's horizon, and a push from a device whose recorded `cursor_hot` is below
    it, get `cursor_too_old` (409), consuming nothing.
- [x] 8. How does a re-attached file avoid a needless re-bootstrap?
  A claim makes a new device record with cursor 0.
  Once the space has collected a tombstone, that record is below the horizon, so the file's first push is refused
  even when its own cursor is past the horizon.
  The first attempt read one page of `hot` right after the claim to record a cursor.
  Answer: a general cycle rule instead.
  When the device record's `cursor_hot` is below `meta.device.gc_horizon_hot` and the file's own cursor is not, the
  round pulls `hot` before it pushes.
  That pull records the cursor; a file whose own cursor is below the horizon gets `cursor_too_old` from it and
  re-bootstraps.
  Only a freshly claimed record meets the condition: a forked record re-bootstraps anyway, and a stale one is
  `rebase_required`.
  The alternative is a server change: no push check until a record's first pull.
- [x] 9. What does recovery do to the attachment queue?
  `sync_attachment_queue` is keyed by attachment id, not by device or card, and it pins nothing.
  Answer: nothing changes.
  - Fork and re-attach keep the queue as it is.
  - After absence cleanup, a retried fetch that no card links drops in `due_transfers`.
    An upload whose image the startup sweep removed drops too, and an image uploaded with no card linking it is
    collected after 90 days.
  - Snapshot apply already queues fetches for the cards a re-bootstrap brings back.
  Item 5 adds one engine test for that last point.
- [x] 10. Migrations?
  Answer: one `V11__sync_recovery.sql` in `koloda`, `V2__recovery.sql` in the server series, and
  `V3__recovery.sql` in the space series.
  Items extend them until the task lands, as `V9` and the server's `V1` were; nothing outside this branch applies
  them before then.

## Plan

- [x] 1. Re-stamp pending cohorts as one unit
  Goal:
  - `V11__sync_recovery.sql` adds `stable_hlc` to `sync_state` (question 3).
    Apply raises it with `last_hlc` for every stamp it observes.
    `push_batch` raises it to the stamp of each cohort it moves from `local` to `uncertain`.
  - `koloda` gains `repo/sync/restamp.rs` with `restamp_local_cohorts(db, now_ms)`, one transaction that:
    - walks the `local` cohorts in old `(hlc, stamp_device)` order, skipping a cohort at a reserved backfill stamp;
    - gives each one the clock's next stamp, starting from the floor in question 3, with the file's current device
      id;
    - decodes each member's envelope, gives it the new header stamp, encodes it again with the envelope codec, and
      writes the new bytes and digest; the payload bytes, `commit_id`, and `sender_seq` stay;
    - moves the register, origin, or tombstone each member wrote to the new stamp, where it still holds the old one,
      including the synthetic registers of a create;
    - updates the cohort's own stamp, and sets `last_hlc` to the last stamp issued.
  - `uncertain` and `fixed` cohorts are never touched.
  - `PROTOCOL.md` §Hybrid logical clock and §Cohorts, `crates/koloda/README.md`, `agents/RUST.md`, and
    `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` name it.
  Constraints:
  - one transaction for the whole walk, because a capture between two cohorts would take a stamp below one still
    waiting;
  - no SQL outside `koloda`; the schema inventory follows the migration (`agents/DB.md`).
  Done when: tests in `crates/koloda/tests/integration/` cover:
  - a reset and its blank scheduling ending on one stamp, and a grade's review and scheduling on one stamp;
  - a create's synthetic registers and a delete's tombstone following their envelopes;
  - outbox bytes that decode to the new stamp with the same payload, and digests that match them;
  - `uncertain` and `fixed` cohorts untouched, and a backfill batch left at its reserved stamp;
  - new stamps rising in the old order, with `last_hlc` on the last one, below a stamp only a re-stamped cohort held;
  - a clock set ahead, a remote write at most 5 minutes ahead replaced by a local edit of the same group, then a
    correction: the re-stamped edit still beats the remote stamp;
  - a grade written on a clock set ahead, with a remote reset between the card's create and that grade: the
    re-stamped grade still beats the reset, so its review and scheduling survive;
  - `bun run check:push` green.
  Commit: Re-stamp pending cohorts as one unit
  Depends on: none

- [x] 2. Track a re-bootstrap with a barrier and clean up what the server deleted
  Goal:
  - `V11` adds `rebase_generation` and `is_rebasing` to `sync_state`, and `seen_generation` to `sync_origins`
    (question 4).
  - `koloda` gains:
    - `begin_rebase(db)`, which raises the generation, opens the barrier, and flags the file to stream a snapshot;
      calling it while the barrier is open changes nothing;
    - marking in `apply_page` and `apply_snapshot_page` while the barrier is open: every create they meet marks its
      origin with the generation, including a create the apply rule drops as a duplicate;
    - `finish_rebase(db, cursor_cold, starter)`, one transaction that deletes what question 4 calls absent, then
      sets `cursor_cold` and closes the barrier.
  - `PROTOCOL.md` §Re-bootstrap and §Client state, and the `koloda` docs, describe the generation and the marks.
  Constraints:
  - the deletion reuses the path an applied tombstone takes for descendants and referents, minus the tombstone;
  - a stream restarted under the same barrier is safe, because marks are idempotent;
  - the schema inventory follows the migration.
  Done when: tests in `crates/koloda/tests/integration/` cover:
  - a deck the stream never delivers: deleted with its cards and its pending edits, with no tombstone;
  - a deck the stream delivers, kept with its pending edit;
  - a create still in the outbox, an in-flight create, and a held create, all kept;
  - a pending card under a deck the space deleted, deleted with the deck;
  - writes captured while the barrier is open, kept;
  - a template the space deleted: decks repaired and the repair published, its cards dropped, no tombstone;
  - repeated `begin_rebase` keeping one barrier, and marks of an earlier generation protecting nothing in the next;
  - a space that holds nothing: the four kinds emptied, revisions and settings kept;
  - `bun run check:push` green.
  Commit: Track a re-bootstrap with a barrier and clean up what the server deleted
  Depends on: none

- [x] 3. Mark stale devices and refuse their pushes
  Goal:
  - Server migration `V2__recovery.sql` adds `rebase_required` to `devices`.
  - `auth::require_device` marks a device stale as question 6 says, before it refreshes `last_seen`.
  - `DeviceInfo` gains `rebase_required`, and `ErrorCode` gains `CursorTooOld` (409).
  - A push from a `rebase_required` device is refused whole with `cursor_too_old`, consuming nothing.
    Receipts, pull, the device calls, and bootstrap still answer.
  - Releasing a snapshot lease clears the flag.
  - `PROTOCOL.md` §Devices, §Errors, and §Bodies, and `crates/koloda-server/README.md`, say so.
  Constraints: staleness uses the injected clock, with no sleeps; a revoked device still gets `401 revoked`.
  Done when: tests in `crates/koloda-server/tests/server/` cover:
  - 89 days idle: the push lands; 91 days idle: refused with `cursor_too_old`, nothing consumed, and the record shows
    `rebase_required`;
  - receipts, pull, the device record, and bootstrap answering while it is flagged;
  - a released lease clearing the flag, and the next push landing;
  - a record another was forked from: stale after 25 hours idle, not after 23; a record with no fork not stale at
    25 hours;
  - `bun run check:push` green.
  Commit: Mark stale devices and refuse their pushes
  Depends on: none

- [ ] 4. Collect tombstones every active device has passed
  Goal:
  - Space migration `V3__recovery.sql` stores the `hot` GC horizon and the `hot` head each lease saw when it opened.
  - `Server::collect_garbage` collects tombstones in each space as question 7 says, then attachments as before.
  - Every device reply reports both horizons in `meta.device`.
  - A pull below its lane's horizon, and a push from a device whose recorded `cursor_hot` is below it, are answered
    `cursor_too_old`, consuming nothing.
  - `PROTOCOL.md` §Topology and server state, §Pull cursor, §Devices, and §Errors, and the server README, say so.
  Constraints:
  - devices are read from `server.db` before the space lock is taken; cursors only rise, so an earlier read is safe;
  - `deleted_ids` is never touched.
  Done when: tests cover:
  - a tombstone one active device has not passed surviving a pass, and removed once every active device has;
  - a stale or revoked device not holding a pass back;
  - a tombstone above a live lease's head kept and delivered by catch-up, then collected after release;
  - a late create of a collected id coming back `fenced`;
  - a device that slept through a pass: its pull from the old cursor and its push both `cursor_too_old`;
  - the horizon in a reply's `meta.device`, and a pass that removes nothing leaving it where it was;
  - `bun run check:push` green.
  Commit: Collect tombstones every active device has passed
  Depends on: 3

- [ ] 5. Re-bootstrap a device the server has left behind
  Goal:
  - The cycle re-bootstraps before it pushes when the device record shows `rebase_required` or the file's own
    `cursor_hot` is below `meta.device.gc_horizon_hot`.
    A push or pull answered `cursor_too_old` starts one the same way.
  - A re-bootstrap runs `begin_rebase`, the existing bootstrap stream and catch-up with marking on, and
    `finish_rebase` in place of `finish_bootstrap`, then releases the lease and repairs learning defaults.
    Nothing is pushed until it ends; the next round pushes what remains.
  - A lapsed lease restarts the stream under the same barrier, and a relaunch mid-rebase resumes from
    `is_rebasing`.
  - `status` shows `Bootstrapping` meanwhile.
  - `PROTOCOL.md` §Cycle and §Re-bootstrap, and `crates/koloda-sync/README.md`, give the device's order.
  Constraints: the joiner's bootstrap keeps its behavior; the harness moves the server clock to make a device stale.
  Done when: tests in `crates/koloda-sync/tests/engine/` cover:
  - a device idle 91 days with pending edits and creates: it re-bootstraps, its creates and its edits to surviving
    entities reach the space, and an entity the space deleted meanwhile disappears locally;
  - a device left behind by a GC pass: `cursor_too_old` starts a re-bootstrap, and its pending card under a deck the
    space deleted does not come back;
  - re-bootstrap with local writes during absence cleanup;
  - a lease that lapses mid-stream, and a relaunch mid-rebase, each finishing the same re-bootstrap;
  - a card the re-bootstrap brings back with an image the file lacks: its fetch is queued (question 9);
  - `bun run check:push` green.
  Commit: Re-bootstrap a device the server has left behind
  Depends on: 2, 3, 4

- [ ] 6. Renumber pending writes for a new sender
  Goal:
  - `V11` adds `has_consumed` to `sync_cohorts` (question 5); push settlement sets it on every cohort with a
    consumed member.
  - `koloda` gains `repo/sync/switch.rs` with `switch_device(db, new_device, receipts, starter, now_ms, rebase)`.
    It runs one transaction that:
    - settles every pending row whose receipt has the same digest, through the settlement a push reply uses;
      a different digest, or no receipt, means the row was never accepted;
    - marks a cohort with a consumed member `fixed` for good, and returns every other cohort to `local`;
    - renumbers every remaining row from 1 in its old order and clears its in-flight flag;
      it rewrites the sender and seq of the register, origin, or tombstone each row wrote;
      `sync_held` rows and their writes stay as they were;
    - sets `device_id` and `next_sender_seq`, and resets `last_observed_server_seq`;
    - re-stamps the `local` cohorts under the new id (item 1);
    - opens the re-bootstrap barrier when `rebase` is set (item 2), so the new id never runs without it.
  - `PROTOCOL.md` §Behind its own record gains the local half; the `koloda` docs name it.
  Constraints: a `fixed` cohort keeps its original `(hlc, stamp_device)`; a cohort is never split.
  Done when: tests in `crates/koloda/tests/integration/` cover:
  - accepted, never accepted, and a receipt with a different digest;
  - a cohort with one accepted member: `fixed`, its other member renumbered with its stamp unchanged;
  - a copy with a reset cohort pending whose original pushed only the reset envelope: the copy keeps the cohort's
    stamp and device;
  - a cohort with a member consumed earlier staying `fixed` with no receipt to show it, and one a lost reply left
    `fixed` returning to `local` and re-stamped under the new id;
  - an outbox contiguous from 1, with registers and origins agreeing, and held rows untouched;
  - a `fenced` receipt deleting the entity as a push outcome does;
  - `bun run check:push` green.
  Commit: Renumber pending writes for a new sender
  Depends on: 1, 2

- [ ] 7. Recover a file that is behind by forking
  Goal:
  - `POST .../devices/fork` takes a `nonce`; the same nonce returns the same device and token (question 5).
  - When the cycle finds the file behind, or a push comes back `seq_reused`, the engine:
    1. stores a fork nonce in `sync_state` unless one is already stored, then calls fork with it;
    2. stores the new token under `sync.token.<new id>`;
    3. reads the receipts for the pending seqs at or below `last_sender_seq`;
    4. runs `switch_device` with `rebase` set (item 6), which also clears the nonce, then deletes the old token;
    5. re-bootstraps under the new id (item 5).
  - `SyncError::Behind` stops being a stop reason, and `Stop::Behind` goes.
  - `PROTOCOL.md` §Behind its own record, §Push outcomes, §Endpoints, and §Bodies, and
    `crates/koloda-sync/README.md`, say so.
  Constraints: no user action; a transport failure leaves the file where it was, and the next cycle resumes.
  Done when: tests cover:
  - each of the three ways a file is found behind, forking before any push or pull, with both files converging;
  - a write pending on the copy reaching the space;
  - two live copies of one file: the second forks, both keep syncing, and the original never forks;
  - `seq_reused` mid-session, and a cohort it cut keeping its stamp under the new sender;
  - a copy whose original pushed only a reset envelope: the blank scheduling reaches the space at the reset's stamp;
  - what the space deleted while the file was behind deleted by the fork's re-bootstrap;
  - a crash after the fork reply and before the switch: the relaunch makes one fork record, not two;
  - the forked-from record going idle and no longer holding a GC pass back;
  - `bun run check:push` green.
  Commit: Recover a file that is behind by forking
  Depends on: 1, 3, 5, 6

- [ ] 8. Re-stamp paused cohorts when the clock is corrected
  Goal:
  - `V11` adds `is_clock_paused` to `sync_state`; a cycle that stops for clock skew sets it, so a relaunch keeps it.
  - The first cycle that reads a skew inside the tolerance with the flag set re-stamps every `local` cohort
    (item 1) before it pushes or applies anything, then clears the flag.
  - A push refused with `stamp_ahead` leaves its cohorts `local`; the cycle re-stamps them once and pushes again.
    A second refusal in the same cycle stops it, because only waiting for wall time helps then.
  - `PROTOCOL.md` §Skew guards and `agents/RUST.md` say so.
  Constraints: the pause itself is unchanged; `fixed` and `uncertain` cohorts keep their stamps.
  Done when: tests cover:
  - captures during a pause, a relaunch, and a corrected clock: one accepted push with stamps from the corrected
    clock, the cohorts' order kept, and each grade's and reset's pair on one stamp;
  - re-stamp of a paused device with a remote reset between one grade's two envelopes;
  - a push refused for a stamp ahead: re-stamped once, then landing;
  - a space that keeps refusing: one retry per cycle, then the refusal is reported;
  - a cycle with no pause leaving the stamps it captured alone;
  - `bun run check:push` green.
  Commit: Re-stamp paused cohorts when the clock is corrected
  Depends on: 1

- [ ] 9. Re-attach a detached or revoked file
  Goal:
  - `join` stops refusing `JoinMode::Reattach` for a detached file.
    It previews the code and refuses before it claims if the file is attached, or if the previewed epoch differs
    from the file's stored one (server restore is a later task).
  - Otherwise it claims with a fresh nonce and stores the token.
    It reads the receipts of the old id for the pending seqs at or below the old record's `last_sender_seq`.
    It then runs `switch_device` without `rebase` (item 6), which also clears `detached_at`.
  - The cycle pulls `hot` before it pushes when the record's cursor is below the horizon and the file's is not
    (question 8).
  - `SyncState` gains the stored epoch.
  - `PROTOCOL.md` §Re-attach, §Cycle, and `crates/koloda-sync/README.md` say so.
  Constraints: rows, stamps, origins, cursors, tombstones, and outbox bytes stay; a refused re-attach leaves the code
  claimable.
  Done when: tests cover:
  - a file detached by `detach`, edited while detached, then re-attached: its edits reach the space, the other
    device's edits reach it, and it does not re-bootstrap;
  - a file revoked by another device, re-attached the same way;
  - a cohort the old id had partly accepted: the rest keeps its stamp under the new id;
  - a file that had passed a since-collected tombstone, re-attached with a write pending: no re-bootstrap;
  - a file below the horizon re-attached: it re-bootstraps, loses what the space deleted, and keeps its own creates;
  - a code for a space with another epoch refused with the code still claimable, and an attached file refused;
  - `bun run check:push` green.
  Commit: Re-attach a detached or revoked file
  Depends on: 5, 6

## Outcome

Not yet.
