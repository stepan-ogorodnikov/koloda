# Sync capture

Status: ready

## Intent

Give the desktop store the local half of sync: once a database is enrolled as a sync device, every product write also records what sync needs to replay it elsewhere, in the same transaction.
That is the register stamps and origins, a sealed envelope in the outbox, and a cohort per commit, as `crates/koloda-sync-proto/PROTOCOL.md` (§Field groups and merge, §Clocks and order, §Transport) describes.
Nothing enrolls a database in production yet; the sync engine task will. Until then capture is dormant and exercised by tests.

Done when: with a test-enrolled database, each write path in `crates/koloda/src/repo` leaves exactly the envelopes the protocol names, decodable with `koloda-sync-proto`, stamped with one HLC per commit, with changed-groups-only saves, reset as two envelopes at one stamp, grades as scheduling plus review, deletes as one tombstone, and coalesced not-in-flight outbox rows; a database that is not enrolled writes no sync rows; `bun run check:push` is green.

## Scope

In:

- Sync bookkeeping tables needed by capture: `sync_state`, `sync_stamps`, `sync_origins`, `sync_outbox`, `sync_cohorts`, `sync_tombstones`.
- A device-enrollment entry point in `koloda` that tests use now and the sync engine will use later.
- Capture in the Rust repos for cards (add, update, delete, reset), grades (lesson results), decks, templates (including clone), algorithms (including clone, revisions, and successor reassignment on delete), and learning settings.
- `koloda` depending on `koloda-sync-proto`.
- `PROTOCOL.md`, decision, README, and `agents/RUST.md` updates, each with the item that makes it true.

Out:

- Apply, repair, delete jobs, and a two-replica harness (next task).
- Backfill of rows that existed before enrollment, including capture-on-touch referent closure (its own task); until then, capture assumes every referenced row is already stamped.
- Transport, outbox in-flight handling beyond the flag, holds, server.
- The web host: it does not sync (`docs/decisions/APP-ROLES.md`).
- Attachment transfer queues; attachment refs already come from `seal`.
- UI and product specs; capture changes no user-visible behavior.

## Open questions

- [x] Area guides? — `agents/RUST.md`, `agents/DB.md`, `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`, `agents/TESTING.md`, `agents/CODE-DOCUMENTATION.md`, `agents/MARKDOWN.md` for doc edits, and `crates/koloda-sync-proto/PROTOCOL.md`; self-review adds `agents/REVIEW.md`.
- [x] Where do sync tables live? — in the one shared migration series, per `agents/DB.md`; web databases create them and never write them. `PROTOCOL.md` (§Client state, ruling 21) is reworded to "only native hosts write them".
- [x] Add `cards.reviews_reset_at` now? — no; deferred to the feature that shows reset time. Nothing displays it, and backfill does not need it (surviving pre-sync reviews are already post-reset). Capture takes `wall_ms` from the commit's wall clock; `PROTOCOL.md` stops calling the column part of the footprint.
- [x] How does the TS ↔ Rust mirroring decision treat Rust-only capture? — as an accepted divergence in `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`: native repos also write sync bookkeeping; the web repos do not, because the web host does not sync.
- [x] Capture when an entity it references is unstamped (a pre-enrollment row)? — no runtime guard now; tests enroll only databases whose rows are all created after enrollment, and the backfill task adds capture-on-touch.

## Plan

- [ ] 1. Add sync bookkeeping tables and device enrollment
  Goal: migration `V5__sync_capture.sql` creating `sync_state` (singleton: device id, last HLC raw, next sender seq), `sync_stamps` (`kind`, `id`, `group` primary key; `hlc`, `stamp_device`, `sender`, `sender_seq`, `product_ts`, `synthetic`), `sync_origins` (same key; stamp, sender columns, `legacy_product_ts_floor`), `sync_outbox` (`sender_seq` primary key; `kind`, `id`, `group`, `commit_id`, envelope bytes, digest, `in_flight`), `sync_cohorts` (`commit_id` primary key; `state`, original stamp), `sync_tombstones` (`kind`, `id` primary key; stamp, sender columns, `successor`); refresh embedded listings on both hosts and the schema inventory.
  `koloda` depends on `koloda-sync-proto`; a `sync` module holds enrollment (`enroll_device(db, device_id)` writes `sync_state`) and reads whether capture is on.
  Constraints: per `agents/DB.md` (next V, never edit applied files, `IF NOT EXISTS`, no backticks, timestamps as unix-ms integers, blobs for bytes); no product table changes; per the open question on placement.
  Update `crates/koloda-sync-proto/PROTOCOL.md` (§Client state, rulings) per the open questions on table placement and `cards.reviews_reset_at`.
  Done when: `cargo test -p koloda` green including the inventory; `bunx nx test @koloda/db-sqlite` green after rebuilding the web bundle; enrollment round-trips in an integration test.
  Commit: Add sync bookkeeping tables and device enrollment
  Depends on: none

- [ ] 2. Record a commit's envelopes in the outbox
  Goal: a capture session opened inside a repo transaction when the database is enrolled: it ticks the HLC once from `sync_state` and the wall clock, mints one `commit_id`, seals each write with `koloda_sync_proto::payload::seal`, assigns consecutive `sender_seq`s, writes the register (`sync_stamps`) or origin (`sync_origins`), the tombstone row for deletes, the outbox row, and one `local` cohort row, and persists the clock and next seq.
  A second write to a group whose not-in-flight outbox row exists deletes that row and appends a new one at the tail.
  A session on a database that is not enrolled does nothing.
  Add the accepted divergence to `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` per the open question; add the `sync` module to the architectural map in `crates/koloda/README.md`; add an `agents/RUST.md` routing row and per-task note: every product write path opens a capture session in its transaction.
  Constraints: one HLC and one `commit_id` per transaction; seal failures fail the transaction; no repo call sites yet.
  Done when: integration tests drive a session directly and assert outbox order, shared stamp and commit id, register and origin rows, coalescing, and no rows when not enrolled.
  Commit: Record each commit's sync envelopes in the outbox
  Depends on: 1

- [ ] 3. Capture card writes
  Goal: `add_card` / `add_cards` emit `cards.create` (deck as parent, template ref, attachment refs from content, initial scheduling); `update_card` emits `cards.content` only when content changed; `delete_card` / `delete_cards` emit one tombstone per card with the deck as parent; `reset_card_progress` emits `cards.reset` (`wall_ms` = commit wall time) and blank `cards.scheduling` in one cohort.
  Constraints: product SQL and behavior unchanged; capture inside the existing transactions.
  Done when: integration tests per path decode the outbox and assert groups, parent, refs, payload values, one stamp per commit, and that a no-op content save emits nothing.
  Commit: Capture card writes for sync
  Depends on: 2

- [ ] 4. Capture grades
  Goal: `submit_lesson_result` emits `cards.scheduling` with the new scheduling and `reviews.row` with the card as parent, in one cohort.
  Done when: an integration test decodes both envelopes at one stamp and checks their values against the stored rows.
  Commit: Capture grades as scheduling plus review
  Depends on: 2

- [ ] 5. Capture deck writes
  Goal: `add_deck` emits `decks.create`, `decks.algorithm`, and `decks.template` in one cohort; `update_deck` emits only the changed groups among `title`, `notes`, `algorithm`, `template`; `delete_deck` emits one deck tombstone and nothing for its cards or reviews.
  Done when: integration tests cover create, each single-group edit, a no-op save, and delete.
  Commit: Capture deck writes for sync
  Depends on: 2

- [ ] 6. Capture template and algorithm writes
  Goal: templates: add and clone emit `templates.create`; update emits changed groups among `title`, `notes`, `structure`; delete emits a tombstone.
  Algorithms: add and clone emit `algorithms.create` plus the `algorithm_revisions.row` the repo records; update emits changed groups among `title`, `notes`, `content`, plus the revision row when parameters changed; delete emits `decks.algorithm` for every reassigned deck and then the tombstone with the `successor` hint, in one cohort.
  Done when: integration tests cover each path, including a parameter save that emits a revision and a title-only save that does not.
  Commit: Capture template and algorithm writes for sync
  Depends on: 2

- [ ] 7. Capture learning settings writes
  Goal: setting or patching `learning` emits one envelope per changed key group: `defaults.algorithm`, `defaults.template` (with refs), `dailyLimits`, `dayStartsAt`, `learnAheadLimit`, each value as its JSON text; other settings slices emit nothing.
  Done when: integration tests cover a single-key change, a multi-key change in one cohort, and a no-op save.
  Commit: Capture learning settings writes per key
  Depends on: 2

## Outcome

<what shipped>
