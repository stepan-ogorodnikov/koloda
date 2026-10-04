# Sync backfill

Status: done

## Intent

Let a desktop database that already holds data enable sync.
Enrolling reserves the backfill stamps.
A resumable scan then moves every row that existed before enrollment into the outbox, in the order `crates/koloda-sync-proto/PROTOCOL.md` §Existing rows at enable time and §Backfill describe.
A local write that touches a row the scan has not reached yet backfills that row and its referents first.
On the device that creates the space, the scan also covers the `learning` document.
Nothing drives the scan in production yet; the sync engine task will. Until then it runs in tests through the fake space.

Done when, for a space-creating replica with data written before enrollment:

- draining its backfill into the fake space leaves a log in which every envelope's parent and referents come earlier;
- a joining replica that pulls the log ends with the same algorithms, revisions, templates, decks, cards, reviews, scheduling, `updated_at`, and learning values;
- writes made before or during the scan converge the same way;
- the backfill conformance cases in `PROTOCOL.md` pass;
- `bun run check:push` is green.

## Scope

In:

- Enrollment takes the device's role in the space (creator or joiner) and reserves the three backfill phase stamps.
- Migration V7 adds the role, the phase stamps, and the scan watermark to `sync_state`.
- A batch entry point in `koloda` that tops the outbox up by a bounded number of envelopes and advances the watermark in the same transaction:
  - phase 1: creates and current groups in referent order, then the `learning` groups on a creator;
  - phase 2: reviews;
  - phase 3: card scheduling snapshots.
- Capture-on-touch: a write that names an unstamped entity backfills it, its referents, and its parent chain in the same commit.
- Joiner scope: seed ids, revisions of the seed algorithm, and the `learning` document are never backfilled.
- Shared builders that encode each kind's create from its stored row, used by the existing create paths and by backfill.
- A fake-space check, used by the backfill tests, that every logged envelope's parent and referents come earlier in the log.
- `PROTOCOL.md`, decision, README, and `agents/RUST.md` updates, each with the item that makes it true.

Out:

- Join modes: the `ids/known` probe, Add and its remint, Replace, deleting seed rows the space lacks, and the `import_pending` phase. These belong to the join task. The joiner role here is only the backfill scope those modes will pass.
- When the engine runs a batch, pushing between batches, holding repair pushes until catch-up, and re-stamping backfill cohorts after a skew pause (the sync engine task).
- The server's existence checks. The fake space only asserts referent order.
- Attachment uploads for cards the scan reaches (the attachment queue). Attachment ids in header refs are outside the log and not checked.
- The web host: it does not sync (`docs/decisions/APP-ROLES.md`).
- UI and product specs. Backfill changes no user-visible behavior until the engine runs it.

## Open questions

- [x] Area guides? — the same as sync-apply: `agents/RUST.md`, `agents/DB.md`, `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`, `agents/TESTING.md`, `agents/CODE-DOCUMENTATION.md`, `agents/CODE-STYLE.md` (change discipline), `agents/MARKDOWN.md` for doc edits, and `crates/koloda-sync-proto/PROTOCOL.md`. Self-review adds `agents/REVIEW.md`.
- [x] Phase stamps: reserve one stamp per phase, or a range of stamps with one per row or batch? — one stamp per phase. Only the order between phases matters; within a phase the log order sets row order. Each batch is still its own commit and cohort. `PROTOCOL.md` says "one stamp per phase" instead of "ranges".
- [x] How does backfill learn the device's role: an enrollment parameter, or a separate start call? — an enrollment parameter, so the stamps are reserved in the enrollment transaction and no write lands between the two. The join task's Add mode can reuse the reservation after it remints.
- [x] On a joiner, does a write to a stamp-zero seed row backfill the seed's create? — no; only the edit is enqueued. The space already holds the seed, and a backfilled create would stamp its groups synthetic at the joiner's stamp, beating the space's older edits locally while the server drops the create as a duplicate.
- [x] Batch unit: envelopes or entities, and may a batch split one entity's envelopes? — a maximum number of envelopes, never splitting one entity's envelopes; the engine sizes batches to the room left in the outbox.
- [x] When does capture stop checking for unstamped referents? — once phase 3 finishes. Every row is stamped by then, except a joiner's untouched seeds, which count as stamped.

## Plan

- [x] 1. Build sync create payloads from stored rows
  Goal: one builder per kind turns a stored row into its sync payloads.
  - The algorithm, template, and card builders return the create payload.
  - The deck builder returns the create plus both pointer groups.
  - The revision builder returns the payload from the stored `algorithm_revisions` row.
  - Builders carry the row's current values and `created_at`. The row's `updated_at` goes only into `legacy_product_ts_floor`; `initial_product_ts` stays empty and pointer groups carry no product timestamp.

  The create paths in `crates/koloda/src/repo/algorithms.rs`, `templates.rs`, `decks.rs`, and `cards.rs` call the builders after their insert.
  A fresh row's `updated_at` is NULL, so their envelopes do not change.
  `capture_learning` in `crates/koloda/src/repo/settings.rs` takes the `Capture` from its caller, so a caller can pass no previous value and emit every learning group.
  Constraints: no behavior change, including the bytes that capture writes; existing tests change only where they call moved helpers.
  Done when: `cargo test -p koloda` and `cargo clippy -p koloda --all-targets -- -D warnings` are green.
  Commit: Build sync create payloads from stored rows
  Depends on: none

- [x] 2. Backfill pre-sync creates when a device enrolls
  Goal: `enroll_device(db, device_id, role)` takes `SpaceRole::Creator` or `SpaceRole::Joiner`.
  In the enrollment transaction it reserves three stamps from the device clock, one per phase and in phase order, and moves `last_hlc` past the last of them.
  Migration `V7__sync_backfill.sql` adds the role, the three stamps, and the watermark (phase, kind, last `created_at`, last id) to `sync_state`.

  `crates/koloda/src/repo/sync/backfill.rs` adds `backfill_batch(db, max_envelopes)`, which reports whether backfill has finished.
  A batch enqueues phase 1 at the phase-1 stamp, scanning by id within each kind:
  1. algorithms;
  2. algorithm revisions;
  3. templates;
  4. decks with both pointers;
  5. cards, whose create carries scheduling;
  6. on a creator only, every `learning` group.

  A row that already has a create or row origin is skipped.
  A joiner skips seed ids, revisions whose algorithm is the seed algorithm, and the `learning` document.
  A batch is one commit with its own cohort; it uses the reserved stamp and does not tick the clock.
  Refresh the embedded listings on both hosts and the schema inventory per `agents/DB.md`.

  Test support in `crates/koloda/tests/common/sync.rs`:
  - `FakeSpace::assert_referents_first` checks that every logged envelope's parent and algorithm or template ref was created or tombstoned earlier in the log;
  - a drain helper alternates `backfill_batch` with pushes until backfill finishes;
  - `enroll` keeps enrolling as a joiner, so seeded test replicas stay at stamp zero and current tests are unchanged.

  Docs: `PROTOCOL.md` §Existing rows at enable time, §Backfill, and §Client state get the phase stamps, the phase-1 scan order with `learning` at its end, and the joiner's skips. The crate README map and `agents/RUST.md` get a routing row and a "Backfill" note. `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` notes that desktop repos also backfill.

  Constraints:
  - no production caller;
  - the scan never replaces an existing register or origin;
  - a batch never splits one entity's envelopes;
  - phase 2 and phase 3 stay unscanned until item 4, so `backfill_batch` reports finished after phase 1 until then.

  Done when: tests in `crates/koloda/tests/integration/sync_backfill_integration_tests.rs` cover:
  - Equal rows and order. A creator with a custom algorithm and its revisions, a custom template, decks, cards, and changed learning settings, all written before enrollment, drains into the fake space. The log passes `assert_referents_first`, and a seeded joiner ends with equal rows, `updated_at` values, and learning settings.
  - Batch size. Batches of two envelopes enqueue in scan order, and no batch splits a deck's create from its pointers.
  - Existing heads. Registers that remote writes set on a legacy row survive the scan, and their groups are not backfilled.
  - Clock. A write captured after enrollment is stamped above the phase-3 stamp.
  - Joiner skips. A joiner enqueues nothing for its seed rows, the seed algorithm's revisions, or `learning`; the conformance case "Start-fresh-then-Join does not push a second initial seed revision".
  - The conformance case "Space created after its device deleted the seed algorithm": the joiner's learning default ends on the creator's real default, not the seed id.

  `cargo test -p koloda` and `bunx nx test @koloda/db-sqlite` (after rebuilding the web bundle) are green.
  Commit: Backfill pre-sync creates when a device enrolls
  Depends on: 1

- [x] 3. Backfill unstamped referents when capture touches them
  Goal: while backfill is unfinished, `Capture::write` first stamps every entity the new envelope names.
  That covers the header's parent chain and its algorithm and template refs, recursively, in the order `PROTOCOL.md` §Backfill lists:
  1. unstamped algorithms;
  2. unstamped templates;
  3. the parent chain, each deck as a create plus pointers;
  4. the entity's own create and current groups when the write is an update or an immutable row on an unstamped entity;
  5. the triggering write.

  These backfills join the triggering commit at its stamp.
  A delete backfills nothing, because a tombstone for an id the server does not hold is accepted as a fence.
  On a joiner, a stamp-zero seed row counts as stamped.
  Docs: `PROTOCOL.md` §Backfill says when touch checks stop, that deletes skip them, and how joiner seeds are treated. `agents/RUST.md` updates its capture note.
  Constraints:
  - once backfill finishes, capture makes no extra query per write;
  - the backfilled create carries the row's values after the triggering product write, and the triggering envelope still follows at the same stamp.

  Done when: tests cover:
  - Card in a legacy deck. A card added to a deck on a template and algorithm that all predate enrollment enqueues the algorithm, the template, the deck's create with its pointers, then the card. This is the conformance case "Card create before referent backfill": the log passes `assert_referents_first` and a joiner gets the card.
  - Card edit. An edit of a legacy card enqueues the card's create and then the edit.
  - Grade. A grade of a legacy card enqueues the card's create, its scheduling, and the review.
  - Learning default. A creator's learning default switched to a legacy algorithm enqueues that algorithm first.
  - Delete. A legacy deck deleted before the scan reaches it enqueues only its tombstone, and the scan later finds none of its cards.
  - No duplicates. A row backfilled by touch is skipped by the scan.
  - Joiner seed. A joiner's edit of a stamp-zero seed algorithm enqueues only the edit.
  Commit: Backfill unstamped referents when capture touches them
  Depends on: 2

- [x] 4. Backfill reviews and scheduling snapshots
  Goal: phase 2 enqueues reviews without an origin at the phase-2 stamp, ordered by `(created_at, id)`.
  Phase 3 enqueues a scheduling snapshot at the phase-3 stamp for each card whose scheduling register is still the synthetic one its phase-1 create wrote.
  A card graded or reset since, locally or remotely, keeps its newer scheduling and gets no snapshot.
  After phase 3, `backfill_batch` reports finished and capture stops its touch checks.
  Docs: `PROTOCOL.md` §Existing rows at enable time says which cards get a snapshot.
  Done when: tests cover:
  - Reviews and scheduling. A joiner ends with every legacy review and every card's final scheduling, and the log orders all of phase 1, then phase 2, then phase 3.
  - The conformance cases "Pre-sync card and review with equal timestamps" and "a pre-sync reset card whose surviving reviews predate its scheduling".
  - Reset after enrollment. A reset on the creator after backfill cuts off every backfilled review of that card on the joiner.
  - Grade before phase 3. A card the joiner grades before the creator's phase 3 keeps that grade on both replicas.
  - New card. A card created after enrollment gets no snapshot.

  `bun run check:push` is green.
  Commit: Backfill reviews and scheduling snapshots
  Depends on: 3

## Outcome

- `enroll_device` takes `SpaceRole::Creator` or `SpaceRole::Joiner` and, in that transaction, reserves one stamp per backfill phase and moves `last_hlc` past the last of them.
- Migration `V7__sync_backfill.sql` adds `role`, the three phase stamps, and the scan watermark to `sync_state` in the shared series. A NULL `backfill_step` means backfill has finished. Web databases have the columns and never write them.
- `create_payload` (algorithms, templates, cards), `create_payloads` (decks: create plus both pointers), and `revision_payload` encode a stored row. The existing create paths call them, so a fresh row's envelopes are unchanged. `learning_payloads` with no previous document emits every learning group.
- `backfill_batch` tops the outbox up by a bounded number of envelopes and advances the watermark in the same transaction: phase 1 creates and current groups in referent order, then `learning` on a creator; phase 2 reviews by `(created_at, id)`; phase 3 a scheduling snapshot for each card whose scheduling register is still the synthetic floor of its phase-1 create. A joiner skips seed ids, the seed algorithm's revisions, and `learning`. A batch never splits one entity's envelopes and never replaces an existing origin or a register that already holds a write.
- While backfill is unfinished, `Capture::write` backfills unstamped referents, the parent chain, and the entity's own create into the triggering commit. Deletes skip that check. A joiner's stamp-zero seed counts as stamped. After phase 3, capture makes no extra query per write.
- `FakeSpace::assert_referents_first` checks referent order in the log, and a delete needs no earlier parent. Backfill tests drain batches into the fake space.
- `PROTOCOL.md` §Existing rows at enable time, §Backfill, and §Client state describe the phase stamps, the scan order, touch checks, and joiner skips. `agents/RUST.md`, the crate README, and `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` route desktop backfill.
- Manual verify: none — nothing drives the scan in production yet, so no user-visible behavior changed.

