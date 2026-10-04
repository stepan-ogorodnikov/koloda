# Sync apply

Status: ready

## Intent

Give the desktop store the receiving half of sync: an enrolled database applies envelopes another device captured, so two replicas that exchange their outboxes converge on the same rows.
That is the apply rule, creates with synthetic registers and seed overlay, last-writer-wins updates with derived `updated_at`, reviews under reset cutoffs, tombstones with their cascades, and repair of pointers whose referent died, as `crates/koloda-sync-proto/PROTOCOL.md` (§Field groups and merge, §Deletes, §Clocks and order) describes.
Nothing delivers envelopes in production yet; the sync engine task will. Until then apply is exercised by a two-replica test harness.

Done when: with two test-enrolled databases exchanging envelopes through an in-memory fake space, every row of `PROTOCOL.md` §Collision outcomes that needs no transport ends with the outcome it names on both replicas; apply follows the apply rule step by step, including seed overlay, deck placeholders, the reset cutoff, delete-wins fencing, and the repair target; one page applies in one transaction; `bun run check:push` is green.

## Scope

In:

- The protocol revision that lets seed rows be deleted, which apply's repair is built on.
- An apply entry point in `koloda` that takes one page of envelope bytes with their server metadata `(seq, sender, sender_seq)` and applies it in one transaction.
- Apply for every kind and group in the registry: cards, reviews, decks, templates, algorithms, algorithm revisions, and the `learning` document.
- The apply rule's effects on local state: dropping pending local writes a remote write beats, and dropping pending cohorts a remote reset or tombstone kills.
- Tombstones: fence, cascade to descendants, and sweep and repair of pointers to a dead template or algorithm, including the new default row when a kind empties.
- Pull cursors in `sync_state`, advanced by apply in the page's transaction.
- A test-only fake space in `crates/koloda/tests/common` that moves outbox rows into a shared log and pulls them into other replicas.
- `PROTOCOL.md`, decision, README, and `agents/RUST.md` updates, each with the item that makes it true.

Out:

- Backfill of rows that existed before enrollment, including the space creator's `learning` backfill (its own task); until then, tests enroll databases whose rows are all created after enrollment.
- Transport, push outcomes, cohort `uncertain` and `fixed` transitions, bootstrap, re-bootstrap, restore, joining (probe, Add, Replace), and the server (the sync engine and server tasks).
- Corrupt and unknown-schema envelopes beyond failing the page; header-only deletes and resets and lane holds come with the engine.
- Chunked delete jobs and deletion-scope-aware reads (a later scale task).
- Attachment fetch queues; apply leaves a card linking an attachment this device lacks as it is.
- The web host: it does not sync (`docs/decisions/APP-ROLES.md`).
- UI and product specs; apply changes no user-visible behavior until the engine runs it.

## Open questions

- [x] Area guides? — `agents/RUST.md`, `agents/DB.md`, `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`, `agents/TESTING.md`, `agents/CODE-DOCUMENTATION.md`, `agents/CODE-STYLE.md` (change discipline), `agents/MARKDOWN.md` for doc edits, and `crates/koloda-sync-proto/PROTOCOL.md`; self-review adds `agents/REVIEW.md`.
- [x] Delete cascade: chunked or synchronous? — synchronous: a remote tombstone cascades inside the page's transaction, as local deletes do today (`delete_deck` in `crates/koloda/src/repo/decks.rs`), and so do the reviews a remote reset kills. `PROTOCOL.md` is reworded so chunked delete jobs are a later optimization of the same logical rule; `sync_delete_jobs` stays unbuilt.
- [x] Where does a new default row's content come from? — the host: repair takes the starter algorithm and template as an input, the same values it passes to `seed_db` as `SeedData`; tests pass fixtures. Cloning the dying row was rejected because concurrent deletes would bring back both deleted rows as copies.
- [x] Does apply write the pull cursor? — yes: migration V6 adds `cursor_hot` and `cursor_cold` to `sync_state`, and apply advances the page's lane to its `scanned_through` in the same transaction (`PROTOCOL.md` §Registers).
- [x] When does the after-catch-up repair of learning defaults run? — as its own call, because only the engine can tell when catch-up is reached; the fake space invokes it after a pull, and the engine will later. Tombstone sweeps stay inside apply.
- [x] Module layout? — `repo/sync/` with `mod.rs` (enrollment), `capture.rs`, `apply.rs`, and `repair.rs`; the move is its own refactor item before any behavior change (`agents/CODE-STYLE.md`, change discipline).

## Plan

- [x] 1. Let seed rows be deleted under the sync protocol
  Goal: `crates/koloda-sync-proto/PROTOCOL.md` replaces undeletable seed rows with ordinary deletion: a dead pointer repairs to the `successor`, else the lowest live id, else a new default row; a joiner keeps a seed id only while the space holds it live; hot bootstrap streams referent kinds first; the space creator backfills the `learning` document; ruling 7 and the conformance cases follow.
  Constraints: protocol text only; no code in `koloda-sync-proto` mentions seeds.
  Done when: no rule in `PROTOCOL.md` depends on a seed row existing.
  Commit: Let seed rows be deleted under the sync protocol
  Depends on: none

- [x] 2. Split sync bookkeeping into enrollment and capture modules
  Goal: move `crates/koloda/src/repo/sync.rs` into `crates/koloda/src/repo/sync/mod.rs` (enrollment: `enroll_device`, `enrolled_device`, and shared helpers) and `crates/koloda/src/repo/sync/capture.rs` (`Capture` and its helpers), and update every import.
  Point the `crates/koloda/README.md` architectural map and the `agents/RUST.md` routing row at the new paths.
  Constraints: no behavior change; tests change only their imports, if at all.
  Done when: `cargo test -p koloda` and `cargo clippy -p koloda --all-targets -- -D warnings` are green.
  Commit: Split sync bookkeeping into enrollment and capture modules
  Depends on: none

- [x] 3. Add the fake space and apply creates
  Goal: `crates/koloda/src/repo/sync/apply.rs` with an entry point, `apply_page(db, page)`, that decodes each entry of one page, validates its header against the registry, and applies the page in one transaction, returning the kinds it changed for the engine's UI events.
  A page is a lane, its entries (envelope bytes plus `seq`, `sender`, `sender_seq`), and `scanned_through`; apply advances that lane's cursor to `scanned_through` in the same transaction.
  This item implements apply rule step 3 for missing referents, step 5 for algorithm revisions (insert if absent, with a `row` origin), and step 6 for creates: insert if absent, with synthetic registers whose `product_ts` comes from `initial_product_ts`, and a `create` origin carrying the entry's sender metadata; overlay of a stamp-zero seed row (a seed id with no register or origin); deck placeholders from the lowest live algorithm and template id; the device clock observes every applied stamp.
  Migration `V6__sync_cursors.sql` adds `cursor_hot` and `cursor_cold` to `sync_state`; refresh the embedded listings on both hosts and the schema inventory per `agents/DB.md`.
  A test-only fake space in `crates/koloda/tests/common/sync.rs`: `push(replica)` moves a replica's not-in-flight outbox rows into a shared log with consecutive seqs and the replica's device as sender; `pull(replica)` applies every later entry from another sender as one page.
  Extend the accepted divergence in `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` (desktop repos also apply envelopes other devices captured); add the `apply` module to the `crates/koloda/README.md` map and an `agents/RUST.md` routing row for remote apply.
  Constraints: apply never goes through repo write paths that capture or record algorithm revisions, so a remote write never re-enters the outbox; an entry that does not decode fails the whole page and applies nothing; a deck create with no live algorithm or template fails the page until item 7 adds the new default row; the fake space makes none of the server's checks (stale heads, existence, compaction), which the server task covers.
  Done when: tests in `crates/koloda/tests/integration/sync_apply_integration_tests.rs` create each kind on A and find equal rows on B, with synthetic registers at A's stamp and origins naming A; a create for an id B already holds is dropped; a stamp-zero seed row is overlaid by a remote seed create; a deck create applied without its pointers sits on the lowest-id placeholders; B's clock is past A's stamp; the cursor moves to `scanned_through` and a failed page leaves it; `cargo test -p koloda` and `bunx nx test @koloda/db-sqlite` (after rebuilding the web bundle) are green.
  Commit: Apply remote creates through a fake sync space
  Depends on: 2

- [x] 4. Apply updates
  Goal: apply rule steps 7–9 for every update group: drop when the row is absent; compare `(hlc, stamp_device)` with the register, where equal plus synthetic wins once; apply the payload, replace the group's `product_ts`, and recompute `updated_at` as the max of the entity's register `product_ts` values and its `legacy_product_ts_floor`; write the register with the entry's sender metadata and `synthetic = 0`; delete a not-in-flight pending outbox row for the same group, and its cohort once empty.
  Learning groups patch one key of the `learning` document; a remote `algorithms.content` records no revision.
  Done when: tests cover a remote edit applied; a remote edit losing to a newer pending local edit, which stays queued; a newer remote edit discarding an older pending local one; an in-flight local row left alone; tied stamps; `updated_at` dropping back when a losing replica held a later product timestamp; a parameter apply that records no revision; a single learning key changed remotely.
  Commit: Apply remote field-group updates by last writer wins
  Depends on: 3

- [x] 5. Apply reviews and resets
  Goal: apply rule step 5 for reviews: dropped unless the review's stamp strictly beats a non-synthetic `cards.reset` register, otherwise inserted with an origin.
  A winning `cards.reset` blanks scheduling at its stamp unless scheduling already beats it, and deletes the reviews that do not strictly beat it, with their origins, in the same transaction.
  A remote reset that kills a pending local grade drops both of that grade's outbox rows in the same transaction.
  Done when: tests cover a reset before and after a remote grade, a tied-HLC reset and grade, a reset arriving before its paired scheduling envelope, reviews arriving after their card's reset, and a pending local grade killed by a remote reset.
  Commit: Apply remote reviews under reset cutoffs
  Depends on: 4

- [x] 6. Apply tombstones
  Goal: apply rule step 1 drops envelopes for a fenced entity or one under a fenced ancestor; step 4 records the `sync_tombstones` row with the entry's sender metadata and `successor`, then cascades in the page's transaction: a deck's cards and their reviews, a card's reviews, with their registers and origins.
  A tombstone for an id this replica does not hold is recorded as a fence; a later create of a fenced id is dropped.
  Pending local rows of a dead entity or its descendants are dropped with their cohorts.
  Reword `PROTOCOL.md` §Deletes (Tombstones), apply rule steps 4 and 9, §Transport (Cycle), and §Client state: deletes and reset-killed reviews cascade in the apply transaction, and chunked delete jobs are a later optimization of the same logical rule.
  Constraints: a template or algorithm tombstone deletes only its row until item 7 adds the pointer sweep, so a referenced one fails the page on its foreign keys.
  Done when: tests cover a deck deleted on A while B adds and edits a card in it (delete wins; the card is gone on both); a card deleted with its reviews; a tombstone for an unknown id that later fences its create; a pending local child dropped by a remote tombstone.
  Commit: Apply remote tombstones with their cascades
  Depends on: 5

- [x] 7. Repair pointers to dead referents
  Goal: `crates/koloda/src/repo/sync/repair.rs`: a template or algorithm tombstone sweeps decks and learning defaults pointing at it to the kind's repair target: the live `successor`, else the live row with the lowest id, else a new default row from the starter input (an algorithm with its revision); it then drops cards on a dead template with their reviews, and only then deletes the referent.
  `apply_page` takes the starter algorithm and template (`InsertAlgorithmData`, `InsertTemplateData`, as in `SeedData`); deck placeholders use the same target, so an empty kind gets a new default row instead of failing the page.
  A pointer or card create that arrives naming a tombstoned referent is repaired or dropped (`PROTOCOL.md` §Deletes, Arrivals).
  Repairs and new default rows are captured as local writes.
  A separate call repairs learning defaults that name no live row; the fake space invokes it after each pull.
  Done when: tests cover an algorithm deleted with a successor on A while B switches a deck to it; a delete without a successor (lowest id); a dead successor; concurrent deletes of the last two algorithms and of the last two templates (each replica creates a default; pointers converge after exchange); a card created under a template deleted on the other replica; a stamp-zero learning default naming an absent seed id.
  Commit: Repair pointers whose referent a remote delete killed
  Depends on: 6

- [x] 8. Run the collision table through the fake space
  Goal: one test per row of `PROTOCOL.md` §Collision outcomes, except the attachment row, which needs transport, in `crates/koloda/tests/integration/sync_collision_integration_tests.rs`; two replicas exchange in both orders and must end with the same rows and the outcome the row names.
  Add the §Conformance cases that need no server: reset applied after its reviews, reset against lower and higher scheduling heads, algorithm edited after a dependent deck create, rename on one device with notes or parameters on another, and an algorithm deleted while another device changes its parameters.
  Constraints: a case already covered in an earlier item's tests is not repeated here (`agents/TESTING.md`, one home per behavior); this file covers the cross-replica outcome only.
  Done when: every collision row and listed case has a passing test, here or in an earlier item's file; `bun run check:push` is green.
  Commit: Run the sync collision table through the fake space
  Depends on: 7

## Outcome

<what shipped>
