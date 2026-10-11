# Sync modules (`src/repo/sync/`)

How each sync path in the desktop crate captures, applies, pushes, and recovers.
The module map is in `crates/koloda/README.md` (§Architectural Map).
The wire rules, field-group merge, and clocks are in `crates/koloda-sync-proto/PROTOCOL.md`.
Cite its sections from here.

**Sync capture** — every product write path opens `Capture::begin` inside its transaction.

- Record only the field groups whose values changed; a save that changes nothing records nothing.
- Call `Capture::delete` before deleting product rows; it reads descendants to forget their registers.
- Capture is a no-op until the database is enrolled, so web parity and non-sync tests are unaffected.
- While backfill runs, `Capture::write` first backfills any unstamped row its envelope names (`backfill::touch`).
  Backfill itself writes through `write_envelope`, which skips that check.

**Remote apply** — `apply_page` writes product rows with its own SQL, never through repo write paths that capture.
`apply_snapshot_page` applies a bootstrap page by the same rule and leaves the cursors alone; `finish_bootstrap`
removes what only an earlier lease of that bootstrap delivered, sets `cold`'s cursor, and clears the flag.

- A page stops at the first entry this app cannot read: what precedes it applies, the cursor stays just below it,
  and the `Hold` says whether the bytes are corrupt or need an app update.
  A payload that decodes but breaks a domain rule apply checks is corrupt; `breaks_domain_rule` in `decode` checks it.
  A delete or reset whose payload alone does not decode applies from its header.
- A remote write that went through one would re-enter the outbox.
- Repairs of pointers to a dead referent are the exception.
  `repair.rs` publishes them through `Capture`, like local writes.
- Two-replica tests exchange outboxes through `FakeSpace` in `tests/common/sync.rs`.

**Push settlement** — `push_batch` marks whole cohorts in flight; the engine sends them and reports back.

- `settle_push` applies every outcome in one transaction; `fenced` and `drop_entity` delete through apply's
  `delete_entity` and `drop_entity`, so a settled delete matches an applied one.
- `push_lost` fixes the batch's cohorts; `push_refused` returns first-time cohorts to `local`.
- After `stamp_ahead`, `unfix_unconsumed` returns a `fixed` cohort above the server's limit to `local` when the device
  record shows no member consumed; `highest_pending_hlc` tells the engine how long a push that stays refused waits.
- `release_held` puts `quota` and `dependency` holds back at the tail with their bytes and stamps, in `fixed`
  cohorts, renumbers their registers, origins, or tombstones, and moves pending rows behind them.
  A held update whose register moved on is dropped.
- A row in flight when `push_batch` runs means an earlier push never settled; its cohort is fixed.
- `settle_push` records the highest seq it saw consumed; `standing` compares it with the device record, and
  `has_foreign_receipt` tells a seq this file dropped from one another copy pushed.

**Attachment transfers** — `settle_push` queues an upload for each `missing_attachments` id the file holds;
remote apply queues a fetch for each linked id the file lacks.

- After a restore, `queue_missing_uploads` queues what the server's missing list names and the file holds, and
  `finish_attachment_check` ends the one check (`sync_state.is_checking_attachments`).
- `due_transfers` drops a fetch whose image arrived, and a retry no card links any more; only retries pay for the
  card scan. The queue pins nothing, so the startup sweep is unchanged.
- `store_fetched` checks the hash and validates like an add, then writes through `insert_attachment`, the one insert
  that `add_attachment` uses too; bytes still go through `attachment_bytes` only.
- `release_deferred_uploads` makes every upload deferred by `defer_for_room` (a `507`) due at once; the engine calls
  it beside `release_held` when the device record shows room.
  An upload `defer_transfer` deferred after a server fault keeps its backoff (`is_waiting_for_room`).

**Re-stamp** — `restamp_local_cohorts` walks the `local` cohorts in one transaction, one new stamp per cohort.

- Its floor is not `last_hlc`: a clock set ahead moved `last_hlc` with the stamps it gave local cohorts.
  It is `stable_hlc`, which apply and push settlement (`mark_consumed`) raise, and every cohort that is not `local`.
- A cycle that stops for skew calls `pause_clock`; `restamp_local_cohorts` clears the pause.
- It moves exactly the registers, origins, and tombstones that still hold a member's old stamp.

**Re-bootstrap** — `begin_rebase` opens the barrier once; `begin_lease` raises the mark generation before each
lease's pages. `apply_create` marks every create it meets while a join bootstrap or the barrier is open, duplicates
included. `finish_rebase` and `finish_bootstrap` remove what the finishing lease left unmarked.

- Removal goes through apply's `remove_entity`, the path an applied tombstone takes, minus the tombstone.
- A create still in the outbox or in `sync_held` is unsent, not absent.

**Device switch** — `switch_device` settles accepted rows through `settle_item`, the path a push reply takes.

- `settle_push` sets `sync_cohorts.has_consumed`; only such a cohort stays `fixed` across a switch.
- The caller stores the new token before the fork call, under `sync.pending_token.{nonce}`, and copies it to
  `sync.token.{device}` before `switch_device`. The id swap, renumbering, re-stamp, and a re-attach's server URL
  and pending claim are one transaction.

**Heal** — `begin_heal` stores a restore's cutoffs and restarts the scan; `heal_batch` enqueues the next batch.

- One call scans at most `SCAN_ROWS` rows and resumes from the last id it scanned, so it may enqueue nothing.
- A write is re-encoded from the row with its stored stamp: creates through each repo's `create_payload`, update
  groups from the row and the register's `product_ts`, tombstones from `sync_tombstones` (which keeps a card's deck).
- A write of this device still waiting in the outbox moves to the tail with its cohort instead; one in flight is
  encoded again.
- The row a write lives in takes the re-push's sender and seq; each batch is a `fixed` cohort with `has_consumed`.
- `finish_rebase` keeps a create above its sender's cutoff while the scan runs.

**Authoritative restore** — `hold_authoritative` records the restore; `reset_for_authoritative` runs only once the
host accepts it.

- It deletes product rows through join's `delete_product_rows`, the list Replace uses, and empties every table in
  join's `SYNC_TABLES` but `sync_state` and `sync_enrolling`; a pending claim outlives it.
- `next_sender_seq` and `last_observed_server_seq` rise to the server's record, so the reset file is neither a seq
  reuser nor read as behind.

**Detach** — `detach` records when the file left its space; the engine sends nothing for a detached file, and
capture keeps recording for a later re-attach.

- The engine records the detach before it deletes the token, so a failed delete still leaves the file detached.
  That delete emits `Event::Error` and the detach succeeds; a re-attach removes the token it left.

**Backfill** — `enroll_device` reserves one stamp per backfill phase.
`backfill_batch` scans rows written before enrollment into the outbox, capped by envelopes and by bytes.

- Each kind's create payload comes from its stored row (`create_payload` in its repo), shared with the create paths.
- A joiner skips seed rows, the seed algorithm's revisions, and `learning`; only the space's creator backfills them.
- Backfill tests drain into `FakeSpace` and call `assert_referents_first`.

**Join** — `join_mode` tells a file's mode from its rows and sync state.
`begin_import` records a claim with its server URL and epoch: it clears every `sync_*` table and leaves the file
`import_pending`.

- While pending, `Capture` records nothing, and `backfill_batch` and `apply_page` refuse.
- The space id is stored at enrollment; only an `active` file in the same space re-attaches.
  One `active` in another space and not detached is `AttachedElsewhere`, which the engine refuses.
- `add_to_space` keeps, deletes, or remints seed rows, remints known rows with their dependents, then reserves the
  backfill stamps as a joiner.
  Cards and their reviews move `REMINT_CHUNK` cards at a time, keyed by rowid, before their decks move.
- A join bootstrap ends with the same absence cleanup as a re-bootstrap. A row with no create origin stays.
- `replace_with_space` deletes product rows only; a blank joiner seeds with `seed_joiner` and enrolls with `enroll`
  in one transaction, so a stop between them leaves the file blank.
- A claim or a space creation waits in `sync_enrolling` (`store_enrolling`) until the transaction that records it
  clears the row: `enroll_device`, `begin_import` (through `SYNC_TABLES`), or a re-attach's `switch_device`.
  A fork's switch leaves it.
- Join tests probe through `FakeSpace::probe`; `copy_of` stands in for a copied file.
