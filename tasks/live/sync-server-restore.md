# Sync server restore

Status: ready

## Intent

Let an operator back up a sync server and restore it, and let every device recover from the restore on its own.
Today the server has no backup, and a restored data directory would leave devices pulling past writes they never
saw and pushing edits whose entities the server lost.
`crates/koloda-sync-proto/PROTOCOL.md` §Server restore describes the way back: a new epoch per restore, **heal**
(devices re-push what the backup lacks) and **authoritative** (devices discard local data and re-download the
backup).
This task builds it in the server, in `koloda`, and in the engine, plus the `spaces` and `pair` operator commands.

Done when:

- `koloda-server backup` copies a running server to a directory, and `koloda-server restore` puts that copy back as
  a new generation with a fresh epoch per space;
- after a heal restore, every device that still syncs re-pushes the writes the backup lacks without user action;
  a write survives if any such device had applied it, and a delete made after the backup stays deleted;
- after an authoritative restore, every device converges on the backup once its host accepts the restore, including a
  device that was offline at the time;
- a device revoked after the backup stays revoked when the replaced data is readable;
- a device enrolled after the backup, and every device after `--rotate-tokens`, re-attaches with a pairing code and
  then recovers the same way;
- an operator can list spaces and issue a pairing code from the command line;
- `bun run check:push` is green and runs the new tests.

## Scope

In:

- `koloda-sync-proto`: the epoch request header, `epoch_changed` with the restore a device must apply, and the
  missing-attachments body, if question 9 holds.
- `koloda-server`:
  - `backup`: an online copy of every database and attachment, with a checksummed manifest;
  - `restore`: a new generation, epochs, accumulated restore points, carried-forward revocations,
    `--authoritative`, `--rotate-tokens`, and the operator's confirmation;
  - refusing device calls from an older epoch;
  - the `spaces` and `pair` commands.
- `koloda`:
  - the heal scan: every write above its sender's cutoff, re-encoded from the row with its stored stamp;
  - the authoritative reset;
  - one migration for the new columns and table.
- `koloda-sync`:
  - the epoch on every device call;
  - heal and authoritative recovery, and a device offline across several restores;
  - `401 unknown_device` and `401 revoked` after a restore, and re-attach to a restored space.
- `PROTOCOL.md`, the READMEs, and `agents/RUST.md`, each with the item that makes them true.

Out:

- Corrupt and unknown-schema envelopes, regeneration of `held` envelopes, raising `write_schema`, `drop-envelope`,
  and quotas (the next sync task).
- The events WebSocket, built-in TLS, Docker, metered-network pauses, and the free-disk preflight.
  Heal re-push and the authoritative re-download are bulk, but they pause only once metered pauses exist.
- Moving a space to a new server URL while devices are attached; a re-attach can record a new URL (question 10).
- Scheduled backups, an S3 attachment backend, pruning old generations, and restoring one space alone.
- A space created after the backup: the restore drops it, and its devices get `unknown_space`.
- The recovery follow-up about a `fixed` cohort stamped more than 5 minutes ahead.
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
  Engine tests need a real restore to run against, and the `koloda` heal scan is the riskiest part, so it goes
  first.
- [x] 3. Does `backup` run while the server serves, and how does it get a consistent copy?
  The proposal says backup "holds the writer barrier", but `serve` holds the data directory lock, and the writer
  locks live inside that process.
  Answer: an online backup that takes no lock and never writes the data directory.
  - Each space database is copied with `VACUUM INTO`, a read transaction, so the copy is one committed state of that
    space; `server.db` is copied last.
  - A space copy is all heal needs to be consistent: its cutoffs come from the `senders` table in the same file.
    The cut between files does no harm.
    A device enrolled after `server.db` was copied gets `unknown_device` and re-attaches.
    A device record newer than its space copy has a cutoff of 0, so it re-pushes everything.
    Restore clamps record cursors to the restored lane heads.
  - Attachment bytes are copied for each row in the space copy.
    A row whose file a collection pass removed meanwhile is deleted from the copy: no card had linked it for 90 days.
  - `manifest.json` is written last: the format version, the time, the source generation, each database's
    SHA-256 and size, and per space its epoch, lane heads, each sender's `last_seq`, and its attachment ids.
    Restore refuses a set whose files do not match it.
  The alternative is an offline backup that takes the directory lock, so the server must be stopped.
- [x] 4. How does a device learn of a restore, and what stops it pushing or pulling on the old epoch?
  The server cannot answer `epoch_changed` without knowing the caller's epoch.
  A device on the old epoch must not pull: its cursor may be past the restored head, so it would skip the new
  generation's first writes.
  Answer:
  - every device-token call carries `Koloda-Epoch: <uuid>`; a device call without it is `bad_request`;
  - `require_device` answers a different epoch with `409 epoch_changed`, after the `revoked` check and before any
    work, so nothing is consumed and no cursor is recorded;
  - the error carries the restore the caller must apply (question 5), and `meta.device` as usual;
  - the claim reply stays as it is: a re-attaching file gets the same error from its first call made with the epoch
    it stored, so `PROTOCOL.md`'s "the claim reply gains `restore_points`" line is replaced.
  The alternative is an optional header: fewer test changes, but a client that forgets it pulls past writes silently.
- [x] 5. What does a restore point hold, and how are several combined?
  Answer:
  - a point holds its epoch, its mode, each lane's head, each sender's `last_seq` from the backup's `senders` table,
    and when it was made;
  - points accumulate in order; restore carries forward the replaced generation's points for that space when they
    are readable, then appends the new one;
  - a device on epoch `E` applies every point after the last one whose epoch is `E`, and every point when no point
    has `E` (only possible when the replaced data was lost too);
  - combined: authoritative if any point is, each head the lowest, and each sender's cutoff the lowest; a sender a
    point does not list counts as 0, so it is omitted;
  - restore also refreshes every restored device's `last_seen` to the restore time (so an old backup marks no one
    stale), clamps its cursors to the restored heads, and drops leases, pairing codes, and pending space creations.
- [x] 6. What does `--rotate-tokens` do, and how does a device answer `401` after a restore?
  Answer:
  - `--rotate-tokens` revokes every restored device: they get `401 revoked` with the new epoch, stop pinning GC, and
    stay in the device list;
  - a `401 revoked` or `401 unknown_device` whose `meta.epoch` differs from the stored epoch detaches the file and
    stops with a new `Stop::Restored`, so the host can say "pair this device again" rather than "revoked";
  - a `401 unknown_device` on the stored epoch keeps today's behavior.
- [x] 7. How does heal re-push what the backup lacks?
  Answer: a resumable scan in `koloda`, like backfill.
  - The restore's cutoffs are stored locally; the scan walks algorithms, revisions, templates, decks, cards,
    `learning`, reviews, then tombstones, creates before update groups.
  - It enqueues every create, non-synthetic register, immutable row, and tombstone whose `(sender, sender_seq)` is
    above its sender's cutoff, re-encoded from the row with the stored stamp and `product_ts`.
  - It also enqueues writes still in the outbox.
    An older pending row pushes before the scan's rows, so an edit of an entity whose create the backup lacks comes
    back `existence` and leaves the outbox.
    If the scan had skipped it, the edit would be lost; the duplicate comes back `stale` when both land.
  - The register, origin, or tombstone takes the re-push's sender and seq, keeping its stamp.
    Every device that holds a lost write then names it by a seq of its own, so the cutoff test of a later restore is
    exact: a consumed seq means the write, or a newer one, is in that backup.
  - A batch is one cohort, `fixed` with `has_consumed`, so neither a clock re-stamp nor a fork's switch ever
    changes a re-pushed stamp.
  - The engine tops the outbox up from the scan before each push, as it does for backfill.
  - A second restore during the scan lowers the cutoffs and restarts it; an authoritative one replaces it.
  - While the scan runs, a re-bootstrap's absence cleanup keeps an entity whose create is above its sender's cutoff,
    as it keeps a create still waiting in the outbox.
- [x] 8. Does an authoritative restore wait for the host?
  `PROTOCOL.md` says the host warns before it starts.
  Answer: yes.
  - The engine records the restore and stops with `Stop::AuthoritativeRestore`; nothing is pushed or pulled.
  - A new host call, `Engine::accept_restore()`, then deletes the product rows and every sync table but
    `sync_state`, keeps settings, conversations, and attachments, and bootstraps as a blank joiner under the same
    token.
  - `next_sender_seq` moves above both its local value and the server's `last_sender_seq` for the device.
  - The recorded restore survives a relaunch.
  The alternative is proceeding at once, with the host told only afterwards.
- [x] 9. Who re-uploads image bytes the backup lacks?
  A card pushed before the backup whose image was uploaded after it is in the restored log, but its bytes are not.
  No push reports it missing, because no device re-pushes that card, so other devices get `404` for it forever.
  Answer: `GET /v1/spaces/{space}/attachments/missing?after&limit` lists the ids live cards link that have no
  stored bytes.
  After applying a restore, the engine walks it once and queues an upload for every id it holds.
  The alternative is leaving it to a later task.
- [x] 10. Fold in the re-attach URL follow-up?
  Recovery noted that re-attach keeps the stored server URL even when the code was redeemed through another one.
  A restore onto a new machine is when that happens.
  Answer: yes; re-attach records the URL the claim went through.
- [x] 11. How do `spaces` and `pair` reach the data?
  Answer: both work on `--data-dir` directly, while `serve` runs, through SQLite's own locking.
  Access to the data directory is the authority, so neither needs the setup token.
  `pair <space>` issues a code by the break-glass rules and prints it with its expiry.
- [x] 12. Migrations?
  Answer: `V12__sync_restore.sql` in `koloda` and `V4__restore.sql` in the space series; `server.db` needs none.
  Items extend them until the task lands, as `V11` and the server's `V2` were.

## Plan

- [x] 1. Re-push the writes a restored server lost
  Goal:
  - `V12__sync_restore.sql` adds `sync_heal_cutoffs (sender, last_seq)`, and `heal_step`, `heal_after_ts`, and
    `heal_after_id` to `sync_state` (question 7).
  - `koloda` gains `repo/sync/heal.rs` with:
    - `begin_heal(db, restore)`, one transaction that stores the epoch, sets each cursor to
      `min(cursor, restore head)`, lowers the stored cutoffs to the restore's, and restarts the scan;
    - `heal_batch(db, max_envelopes, max_bytes) -> Heal`, which enqueues the next batch as question 7 says and clears
      the cutoffs and the step when the scan ends.
  - Each repo gains a payload builder for its update groups, from the row and the register's `product_ts`.
    Creates reuse the backfill builders; a tombstone takes its stored hints; `cards.reset` takes
    `reviews_reset_at`.
  - The heal writer seals each envelope with the stored stamp and a new seq, writes the outbox row, and moves the
    register, origin, or tombstone to the new sender and seq.
  - `finish_rebase` keeps an entity whose create is above its sender's cutoff while the scan runs.
  - `PROTOCOL.md` §Server restore and §Client state, `crates/koloda/README.md`, and `agents/RUST.md` say so.
  Constraints:
  - no SQL outside `koloda`; the scan walks keyset batches and holds nothing in memory per entity;
  - every re-encoded envelope passes capture's round-trip check;
  - the schema inventory follows the migration (`agents/DB.md`).
  Done when: tests in `crates/koloda/tests/integration/` cover:
  - writes above the cutoff enqueued, writes at it not, every write of a sender the restore omits enqueued, and
    synthetic registers and stamp-zero seed rows skipped;
  - a card whose deck create is also above the cutoff: the deck's create and pointers, then the card's create and
    groups, in that order, with tombstones last;
  - re-encoded envelopes decoding to the stored stamp and the row's values, with digests that match;
  - registers, origins, and tombstones naming the re-push seq, with stamps unchanged;
  - a write still in the outbox enqueued again;
  - a batch cap resuming at the same place, and a second `begin_heal` mid-scan lowering cutoffs and restarting;
  - `restamp_local_cohorts` leaving heal cohorts alone, and `switch_device` keeping them `fixed` with their stamps;
  - `finish_rebase` keeping a create the scan has not reached;
  - `bun run check:push` green.
  Commit: Re-push the writes a restored server lost
  Depends on: none

- [x] 2. Reset a file for an authoritative restore
  Goal:
  - `V12` adds the recorded authoritative restore to `sync_state`: its epoch and the server's `last_sender_seq` for
    the device (question 8).
  - `koloda` gains `hold_authoritative(db, epoch, last_sender_seq)`, which records it, and
    `reset_for_authoritative(db)`, one transaction that:
    - deletes reviews, cards, decks, algorithm revisions, algorithms, and templates;
    - empties every sync table but `sync_state`, the heal cutoffs and attachment queue included;
    - keeps `device_id`, the space, the server URL, the role, `last_hlc`, and `stable_hlc`;
    - stores the epoch, sets `next_sender_seq` above both its own and the recorded value, zeroes the cursors, clears
      the heal, rebase, backfill, fork, and clock-pause state, and flags the file to bootstrap.
  - Settings rows stay; `learning` stays at stamp zero so the space's document overlays it.
    Conversations and attachments stay.
  - `PROTOCOL.md` §Server restore and `crates/koloda/README.md` say so.
  Constraints: one transaction; nothing is deleted while only `hold_authoritative` has run.
  Done when: tests in `crates/koloda/tests/integration/` cover:
  - product rows and sync tables empty, settings, conversations, and attachments kept;
  - `next_sender_seq` above both values, whichever is larger;
  - a snapshot of another space then applying as for a blank joiner, with seeds inserted and `learning` overlaid;
  - a recorded restore surviving a reopen, and cleared by the reset;
  - `bun run check:push` green.
  Commit: Reset a file for an authoritative restore
  Depends on: 1

- [x] 3. Back up a running server
  Goal:
  - `koloda_server::backup::backup(data_dir, out_dir, now_ms)` and `koloda-server backup --data-dir <dir> <out>`
    copy the active generation as question 3 says.
  - It refuses an `out` that exists and is not empty, writes the manifest last, and fsyncs every file and directory.
  - `crates/koloda-server/README.md` gains the command and the backup layout.
  Constraints: no lock; nothing in the data directory is written; `serve` keeps answering throughout.
  Done when: tests in `crates/koloda-server/tests/server/` cover:
  - a backup taken between pushes: each copy opens, holds what was committed before it was taken, and matches its
    checksum;
  - the manifest's heads, senders, epochs, and attachment ids;
  - an attachment whose file a collection pass removed before the copy: its row is gone from the copy;
  - an `out` that is not empty refused;
  - `bun run check:push` green.
  Commit: Back up a running server
  Depends on: none

- [x] 4. Restore a server from a backup
  Goal:
  - Space migration `V4__restore.sql` adds the restore points and their cutoffs (question 5).
  - `koloda_server::restore::prepare(data_dir, backup_dir, options, now_ms)` verifies the manifest and stages a new
    generation from the backup.
    - Each space gets a fresh epoch, the replaced generation's points it lacks, and the new point.
    - Leases, pairing codes, and pending space creations go.
    - Device cursors are clamped and `last_seen` is refreshed (question 5).
    - Revocations newer than the backup are carried forward from the replaced data when it is readable.
    - `rotate_tokens` revokes every device (question 6).
  - `Prepared::devices()` lists the restored devices; `Prepared::commit()` fsyncs and swaps `CURRENT`.
    Dropping it uncommitted removes the staged generation.
  - `koloda-server restore --data-dir <dir> <backup> [--authoritative] [--rotate-tokens] [--yes]` takes the
    directory lock, prints the devices, and asks before it commits unless `--yes`.
    It also restores into a directory with no server.
  - The replaced generation stays on disk.
  - `PROTOCOL.md` §Server restore and the server README say so.
  Constraints: `CURRENT` moves only after the new generation is complete; a refused restore changes nothing.
  Done when: tests cover:
  - a restore: `CURRENT` moved, each space on an epoch that neither the backup nor the replaced generation had, and a
    point with its heads and cutoffs;
  - the same backup restored twice: two epochs, and both points in the second generation;
  - a device revoked after the backup still revoked, and one enrolled after it answered `401 unknown_device` with the
    new epoch in `meta`;
  - `--rotate-tokens`: every device `401 revoked`;
  - an old pairing code failing, an old lease answering `410`, and a cursor above the restored head clamped;
  - a tampered file refused with `CURRENT` unchanged, a restore into an empty directory, and a restore refused while
    `serve` holds the lock;
  - `bun run check:push` green.
  Commit: Restore a server from a backup
  Depends on: 3

- [x] 5. Refuse device calls from an older epoch
  Goal:
  - `transport.rs` gains `EPOCH_HEADER`, `ErrorCode::EpochChanged` (409), and `Restore` as question 5 combines it.
    `ErrorBody` gains an optional `restore`.
  - `auth::require_device` refuses another epoch as question 4 says, and a device call without the header.
  - The engine sends the stored epoch on every device call; `Request` gains it, and `HttpTransport` and the test
    transports pass it on.
  - The server test harness sends it too.
  - `PROTOCOL.md` §Endpoints, §Bodies, §Errors, and §Server restore, and the crate READMEs, say so.
  Constraints: the check comes after the `revoked` check and before any work.
  Done when: tests cover:
  - push, pull, receipts, bootstrap, devices, and attachments refused on an older epoch: nothing consumed and no
    cursor recorded;
  - a heal point then an authoritative one combined: authoritative, the lowest heads and cutoffs, a sender one point
    omits left out;
  - an epoch no point names getting every point;
  - a missing header refused, and the current epoch answered as before;
  - existing engine tests passing with the header;
  - `bun run check:push` green.
  Commit: Refuse device calls from an older epoch
  Depends on: 4

- [x] 6. Heal a device after a server restore
  Goal:
  - On `epoch_changed` with a heal restore, the engine runs `begin_heal` (item 1) and starts the round again.
    A file waiting for Add or Replace only stores the new epoch.
  - Before each push, while the outbox holds less than one batch, the cycle tops it up from `heal_batch`, then from
    backfill.
  - `SyncError` carries the restore; the status shows the heal's pending writes.
  - The engine harness gains a backup and an in-process restore that swaps the router its transport calls.
  - `PROTOCOL.md` §Cycle and §Server restore, and `crates/koloda-sync/README.md`, say so.
  Constraints: heal deletes nothing and bootstraps nothing; re-pushed stamps never change.
  Done when: tests in `crates/koloda-sync/tests/engine/` cover:
  - a post-backup write whose HLC is below an unrelated restored head;
  - a write whose original device is gone, re-pushed by another;
  - a foreign low-HLC tombstone after the backup still fencing;
  - the same backup restored twice, with no re-pairing;
  - one device re-pushing only a tombstone and another the create of the same entity, in both orders: still
    deleted;
  - a card whose deck create is also post-backup: no `existence`;
  - a clock-skew pause during the heal: re-pushed stamps unchanged;
  - only a `stale` re-pusher holding an image's bytes: it uploads;
  - a device offline across two heal restores, applying the lower cutoffs;
  - an edit pending at the restore reaching the space;
  - `bun run check:push` green.
  Commit: Heal a device after a server restore
  Depends on: 1, 5

- [x] 7. Re-download the backup after an authoritative restore
  Goal:
  - On `epoch_changed` with an authoritative restore, the engine runs `hold_authoritative` (item 2) and stops with
    `Stop::AuthoritativeRestore`; a held file pushes and pulls nothing.
  - `Engine::accept_restore()` runs `reset_for_authoritative`; the next cycle bootstraps the file as a blank joiner.
  - An authoritative restore replaces a heal or bootstrap in progress.
  - `PROTOCOL.md` §Server restore and `crates/koloda-sync/README.md` say so.
  Constraints: nothing is deleted before the host accepts.
  Done when: tests cover:
  - a mass delete that reached every device, then an authoritative restore: each device stops, accepts, and
    converges on the backup, one that was offline at the time included;
  - a write pending at the restore gone, and the next push using a seq the server never consumed;
  - a device offline across an authoritative then a heal restore converging on the authoritative backup;
  - a relaunch before accepting still held, with nothing deleted;
  - `bun run check:push` green.
  Commit: Re-download the backup after an authoritative restore
  Depends on: 2, 6

- [ ] 8. Re-attach a device the restore forgot
  Goal:
  - A `401 revoked` or `401 unknown_device` on an epoch other than the stored one detaches the file and stops with
    `Stop::Restored` (question 6).
  - Re-attach stops refusing a newer epoch.
    It claims, stores the token, and applies the restore its first call reports with the stored epoch.
    After a heal it switches as before; a missing old record counts as no consumed seq.
    After an authoritative restore it holds as item 7 does.
  - Re-attach records the server URL the code was redeemed through (question 10).
  - `PROTOCOL.md` §Devices and §Re-attach, and `crates/koloda-sync/README.md`, say so.
  Constraints: a refused re-attach still leaves the code claimable.
  Done when: tests cover:
  - a device enrolled after the backup: `401 unknown_device`, detached, re-attached, healed, and its writes in the
    space;
  - `--rotate-tokens`: every device revoked, each re-attached, and no write lost;
  - a re-attach after an authoritative restore: held, accepted, converged;
  - a re-attach through a different server URL recording it;
  - `bun run check:push` green.
  Commit: Re-attach a device the restore forgot
  Depends on: 6, 7

- [ ] 9. Upload image bytes the restored server lacks
  Goal:
  - `GET /v1/spaces/{space}/attachments/missing?after&limit` returns, in id order, at most 1000 ids that live cards
    link and the space holds no bytes for (question 9).
  - `V12` adds a flag that a restore sets; the engine then walks the list once, queues an upload for each id it holds,
    and clears the flag.
  - `PROTOCOL.md` §Endpoints, §Bodies, and §Attachments, and both READMEs, say so.
  Constraints: uploads keep their existing queue and retries.
  Done when: tests cover:
  - a card pushed before the backup, its image uploaded after: after the restore the device holding the bytes uploads
    them, and another device fetches them;
  - the endpoint's paging and its omission of unlinked attachments;
  - a relaunch mid-walk finishing it;
  - `bun run check:push` green.
  Commit: Upload image bytes the restored server lacks
  Depends on: 6

- [ ] 10. Add spaces and pair operator commands
  Goal:
  - `koloda-server spaces --data-dir <dir>` lists each space's id, name, creation time, and device count.
  - `koloda-server pair --data-dir <dir> <space>` issues a pairing code by the break-glass rules and prints it with
    its expiry (question 11).
  - Both run beside `serve`.
  - The server README says so.
  Constraints: the commands share the code the HTTP handlers use.
  Done when: tests cover:
  - the list matching `GET /v1/spaces`;
  - a code from `pair` claimed over HTTP, and an unknown space refused;
  - `bun run check:push` green.
  Commit: Add spaces and pair operator commands
  Depends on: none

## Outcome

Not yet.
