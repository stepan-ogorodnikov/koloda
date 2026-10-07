# koloda Routing Guide

Routes common changes inside `crates/koloda` to the right files.
Crate layout, ownership boundaries, and "Does NOT own" live in `crates/koloda/README.md`.
This file only tells you where to start.

## Task routing table

| Task | Start here |
| --- | --- |
| Entity CRUD (new resource, or fields on an existing one) | `src/domain/<entity>.rs` + `src/repo/<entity>.rs` |
| Add or change a validation error code | `src/app/error.rs` (`error_codes`) + the domain `validate()` that returns it |
| Add or change a settings slice or field | `src/domain/settings_<name>.rs`, dispatched in `src/domain/settings.rs` |
| FSRS state bucketing in SQL | `src/repo/fsrs_sql.rs` |
| FSRS progress field bounds | `src/domain/progress.rs` |
| Daily-limit / review-totals policy | `src/domain/reviews.rs::calculate_todays_review_totals` |
| Review row writes | `src/repo/reviews.rs::insert_review` |
| A product write path (sync capture) | `src/repo/sync/capture.rs::Capture` + `crates/koloda-sync-proto/PROTOCOL.md` (§Field groups and merge) |
| Applying remote sync envelopes | `src/repo/sync/apply.rs::apply_page` + `crates/koloda-sync-proto/PROTOCOL.md` (§Field groups and merge, Apply rule) |
| Pushing the outbox and settling outcomes | `src/repo/sync/outbox.rs` + `crates/koloda-sync-proto/PROTOCOL.md` (§Cohorts, §Push outcomes) |
| Image uploads and fetches between devices | `src/repo/sync/attachments.rs` + `crates/koloda-sync-proto/PROTOCOL.md` (§Attachments) |
| New stamps for pending writes | `src/repo/sync/restamp.rs` + `crates/koloda-sync-proto/PROTOCOL.md` (§Hybrid logical clock, §Cohorts) |
| Re-bootstrap and absence cleanup | `src/repo/sync/rebase.rs` + `crates/koloda-sync-proto/PROTOCOL.md` (§Re-bootstrap) |
| A new device id for a forked or re-attached file | `src/repo/sync/switch.rs` + `crates/koloda-sync-proto/PROTOCOL.md` (§Behind its own record) |
| Re-pushing what a restored server lacks | `src/repo/sync/heal.rs` + `crates/koloda-sync-proto/PROTOCOL.md` (§Server restore) |
| Discarding local data for an authoritative restore | `src/repo/sync/authoritative.rs` + `crates/koloda-sync-proto/PROTOCOL.md` (§Server restore) |
| Enabling sync on a database that already holds rows | `src/repo/sync/backfill.rs::backfill_batch` + `crates/koloda-sync-proto/PROTOCOL.md` (§Existing rows at enable time, Backfill) |
| Joining an existing space | `src/repo/sync/join.rs` + `crates/koloda-sync-proto/PROTOCOL.md` (§Joining) |
| Schema / migrations | `agents/DB.md` |
| AI provider enum / secrets redaction | `agents/ADD-AI-PROVIDER.md` |
| Hotkeys settings | `agents/ADD-HOTKEY.md` |
| Assistant chat persistence | `agents/ASSISTANT-MAP.md` |

## Per-task notes

**Entity CRUD** — follow the chain end to end.

- Types and validation in `src/domain/<entity>.rs`.
- SQL and error wrapping in `src/repo/<entity>.rs`.
- Test pair: `tests/domain/<entity>_tests.rs` (domain, no DB) and `tests/integration/<entity>_integration_tests.rs` (repo).
  Larger entities split these by concern.
  Register new modules in `tests/domain/main.rs` / `tests/integration/main.rs`; do not add a new `tests/*.rs` crate root.
- Register the command in `apps/electron/src-rust/src/lib.rs`.
- Expose it as `ipcMain.handle("cmd_*", …)` in `apps/electron/src/data-ipc.ts` —
  the `#[napi]` method alone is not reachable from the renderer.
- TS reaches it via `invoke("cmd_*")` in `apps/electron-react/src/app/queries.ts`.

**Error codes** — add the const to `error_codes` in `src/app/error.rs`.

- Return it from domain validation, not from repo lookup misses.
- Keep the code string identical to the TS mirror in `libs/app/src/lib/error.ts` (`ErrorCode`).
- Add the same string as a key in `ERROR_MESSAGES` in that file.
- Nothing else to maintain: `libs/app/src/lib/error-parity.test.ts` parses the
  `error_codes` consts out of `src/app/error.rs` and fails if either side drifts.
  TS-only `ai.*` keys live only in `ERROR_MESSAGES` (allow-listed in the test).

**Settings slices** — a slice module owns its struct plus `validate()` (and `fill_defaults()` where defaults exist).

- `src/domain/settings.rs` holds the `SettingsName` variant and the arms in both `validate()` and `normalize()`.
- Storage is generic in `src/repo/settings.rs`; slices never touch SQL.
- Mirror the registry in `libs/settings/src/index.ts` (`allowedSettings`).
- The hotkeys slice has a dedicated walkthrough: `agents/ADD-HOTKEY.md`.

**FSRS bucketing** — build every state predicate from the helpers in `src/repo/fsrs_sql.rs`
(`eq_new`, `in_learn`, `eq_review`, `in_all_tracked`).

- Do not inline state integers into lesson, review, or card queries.

**Progress bounds** — validators in `src/domain/progress.rs` take the caller's error code,
so card-progress and review namespaces stay distinct.

**Review totals policy** — `calculate_todays_review_totals` in `src/domain/reviews.rs` is pure.

- Keep it in sync with `calculateTodaysReviewTotals` in `libs/srs/src/lib/reviews.ts`.

**Sync capture** — every product write path opens `Capture::begin` inside its transaction.

- Record only the field groups whose values changed; a save that changes nothing records nothing.
- Call `Capture::delete` before deleting product rows; it reads descendants to forget their registers.
- Capture is a no-op until the database is enrolled, so web parity and non-sync tests are unaffected.
- While backfill runs, `Capture::write` first backfills any unstamped row its envelope names (`backfill::touch`).
  Backfill itself writes through `write_envelope`, which skips that check.

**Remote apply** — `apply_page` writes product rows with its own SQL, never through repo write paths that capture.
`apply_snapshot_page` applies a bootstrap page by the same rule and leaves the cursors alone; `finish_bootstrap`
sets `cold`'s and clears the joiner's bootstrap flag.

- A remote write that went through one would re-enter the outbox.
- Repairs of pointers to a dead referent are the exception.
  `repair.rs` publishes them through `Capture`, like local writes.
- Two-replica tests exchange outboxes through `FakeSpace` in `tests/common/sync.rs`.

**Push settlement** — `push_batch` marks whole cohorts in flight; the engine sends them and reports back.

- `settle_push` applies every outcome in one transaction; `fenced` and `drop_entity` delete through apply's
  `delete_entity` and `drop_entity`, so a settled delete matches an applied one.
- `push_lost` fixes the batch's cohorts; `push_refused` returns first-time cohorts to `local`.
- A row in flight when `push_batch` runs means an earlier push never settled; its cohort is fixed.
- `settle_push` records the highest seq it saw consumed; `standing` compares it with the device record, and
  `has_foreign_receipt` tells a seq this file dropped from one another copy pushed.

**Attachment transfers** — `settle_push` queues an upload for each `missing_attachments` id the file holds;
remote apply queues a fetch for each linked id the file lacks.

- `due_transfers` drops a fetch whose image arrived, and a retry no card links any more; only retries pay for the
  card scan. The queue pins nothing, so the startup sweep is unchanged.
- `store_fetched` checks the hash and validates like an add, then writes through `insert_attachment`, the one insert
  that `add_attachment` uses too; bytes still go through `attachment_bytes` only.

**Re-stamp** — `restamp_local_cohorts` walks the `local` cohorts in one transaction, one new stamp per cohort.

- Its floor is not `last_hlc`: a clock set ahead moved `last_hlc` with the stamps it gave local cohorts.
  It is `stable_hlc`, which apply and push settlement (`mark_consumed`) raise, and every cohort that is not `local`.
- A cycle that stops for skew calls `pause_clock`; `restamp_local_cohorts` clears the pause.
- It moves exactly the registers, origins, and tombstones that still hold a member's old stamp.

**Re-bootstrap** — `begin_rebase` opens the barrier; `apply_create` marks every create it meets while it is open,
duplicates included; `finish_rebase` removes what stayed unmarked.

- Removal goes through apply's `remove_entity`, the path an applied tombstone takes, minus the tombstone.
- A create still in the outbox or in `sync_held` is unsent, not absent.

**Device switch** — `switch_device` settles accepted rows through `settle_item`, the path a push reply takes.

- `settle_push` sets `sync_cohorts.has_consumed`; only such a cohort stays `fixed` across a switch.
- The caller stores the new token before the call; the id swap, renumbering, and re-stamp are one transaction.

**Heal** — `begin_heal` stores a restore's cutoffs and restarts the scan; `heal_batch` enqueues the next batch.

- A write is re-encoded from the row with its stored stamp: creates through each repo's `create_payload`, update
  groups from the row and the register's `product_ts`, tombstones from `sync_tombstones` (which keeps a card's deck).
- A write of this device still waiting in the outbox moves to the tail with its cohort instead; one in flight is
  encoded again.
- The row a write lives in takes the re-push's sender and seq; each batch is a `fixed` cohort with `has_consumed`.
- `finish_rebase` keeps a create above its sender's cutoff while the scan runs.

**Authoritative restore** — `hold_authoritative` records the restore; `reset_for_authoritative` runs only once the
host accepts it.

- It deletes product rows through join's `delete_product_rows`, the list Replace uses, and empties every table in
  join's `SYNC_TABLES` but `sync_state`.
- `next_sender_seq` and `last_observed_server_seq` rise to the server's record, so the reset file is neither a seq
  reuser nor read as behind.

**Detach** — `detach` records when the file left its space; the engine sends nothing for a detached file, and
capture keeps recording for a later re-attach.

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
- `add_to_space` keeps, deletes, or remints seed rows, remints known rows with their dependents, then reserves the
  backfill stamps as a joiner.
- `replace_with_space` deletes product rows only; a blank joiner seeds with `seed_joiner_db` and enrolls.
- Join tests probe through `FakeSpace::probe`; `copy_of` stands in for a copied file.

**Review writes** — `insert_review` in `src/repo/reviews.rs` is the single write path (`pub(crate)`).

- Its callers are `submit_lesson_result` in `src/repo/lessons.rs` and remote apply in `src/repo/sync/apply.rs`.
  Remote apply passes the review id it received.
- A new writer goes through `insert_review` inside its own transaction, never fresh INSERT SQL.

## Non-negotiables

- `domain/` must not import `rusqlite`.
  SQL lives in `repo/` (plus the DB status probe in `app/init.rs`).
- `domain/` must not import `repo/`.
- Domain importing `crate::app::error` is intentional.
  Shared `AppError` codes stay aligned with `@koloda/app`.
- Each domain file mirrors one TS module, entity per file (`docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`).
  Change both sides together.
