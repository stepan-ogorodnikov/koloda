# Sync apply

Status: draft

## Intent

Give the desktop store the receiving half of sync: an enrolled database applies envelopes another device captured, so two replicas that exchange their outboxes converge on the same rows.
That is the apply rule, creates with synthetic registers and seed overlay, last-writer-wins updates with derived `updated_at`, reviews under reset cutoffs, tombstones with their cascades, and repair of pointers whose referent died, as `crates/koloda-sync-proto/PROTOCOL.md` (§Field groups and merge, §Deletes, §Clocks and order) describes.
Nothing delivers envelopes in production yet; the sync engine task will. Until then apply is exercised by a two-replica test harness.

Done when: with two test-enrolled databases exchanging envelopes through an in-memory fake space, every row of `PROTOCOL.md` §Collision outcomes that needs no transport ends with the outcome it names on both replicas; apply follows the apply rule step by step, including seed overlay, deck placeholders, the reset cutoff, delete-wins fencing, and the repair target; one page applies in one transaction; `bun run check:push` is green.

## Scope

In:

- An apply entry point in `koloda` that takes one page of envelope bytes with their server metadata `(seq, sender, sender_seq)` and applies it in one transaction.
- Apply for every kind and group in the registry: cards, reviews, decks, templates, algorithms, algorithm revisions, and the `learning` document.
- The apply rule's effects on local state: dropping pending local writes a remote write beats, and dropping pending cohorts a remote reset or tombstone kills.
- Tombstones: fence, cascade to descendants, and sweep and repair of pointers to a dead template or algorithm, including the new default row when a kind empties.
- A test-only fake space in `crates/koloda/tests/common` that moves outbox rows into a shared log and pulls them into other replicas.
- `PROTOCOL.md`, decision, README, and `agents/RUST.md` updates, each with the item that makes it true.

Out:

- Backfill of rows that existed before enrollment, including the space creator's `learning` backfill (its own task); until then, tests enroll databases whose rows are all created after enrollment.
- Transport, push outcomes, cohort `uncertain` and `fixed` transitions, bootstrap, re-bootstrap, restore, joining (probe, Add, Replace), and the server (the sync engine and server tasks).
- Corrupt and unknown-schema envelopes beyond failing the page; header-only deletes and resets and lane holds come with the engine.
- Chunked delete jobs and deletion-scope-aware reads (a later scale task; see the cascade open question).
- Attachment fetch queues; apply leaves a card linking an attachment this device lacks as it is.
- The web host: it does not sync (`docs/decisions/APP-ROLES.md`).
- UI and product specs; apply changes no user-visible behavior until the engine runs it.

## Open questions

- [ ] Area guides? — open; to be routed by the human. Likely `agents/RUST.md`, `agents/DB.md` (if the cursor question adds a migration), `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`, `agents/TESTING.md`, `agents/CODE-DOCUMENTATION.md`, `agents/MARKDOWN.md` for doc edits, and `crates/koloda-sync-proto/PROTOCOL.md`.
- [ ] Delete cascade: chunked or synchronous? — open. `PROTOCOL.md` (§Deletes, Tombstones) has a delete record a `sync_delete_jobs` row and remove descendants in bounded chunks, with every repository read treating a pending scope as absent. Local deletes cascade in one transaction today (`delete_deck` in `crates/koloda/src/repo/decks.rs`). Recommendation: apply a remote tombstone the same way, inside the page's transaction, and likewise the reviews a remote reset kills; reword §Tombstones and §Client state so chunked jobs are a later optimization of the same logical rule; leave `sync_delete_jobs` unbuilt.
- [ ] Where does a new default row's content come from? — open. Repair step 3 (`PROTOCOL.md` §Deletes, Referents are not parents) writes "the starter content first run writes", but `koloda` does not own that content: the host passes it to `seed_db` as localized `SeedData`. Recommendation: apply takes the starter algorithm and template as an input, the same values the host seeds with; tests pass fixtures. Alternative: clone the dying row under a fresh id, which needs no input but can bring back both concurrently deleted rows as copies.
- [ ] Does apply write the pull cursor? — open. `PROTOCOL.md` (§Registers) says every remote apply writes rows, stamps, and the cursor in one transaction, and §Client state lists cursors in `sync_state`, but no cursor column exists yet. Recommendation: add `cursor_hot` and `cursor_cold` to `sync_state` in this task, and have apply advance the page's lane to its `scanned_through` in the same transaction.
- [ ] When does the after-catch-up repair of learning defaults run? — open. `PROTOCOL.md` (§Deletes, Referents are not parents) runs it after catch-up, which only the engine can detect. Recommendation: a separate call that the fake space invokes after a pull and the engine invokes later; tombstone sweeps stay inside apply.
- [ ] Module layout? — open. `crates/koloda/src/repo/sync.rs` holds enrollment and capture in 425 lines, and apply plus repair will roughly double it. Recommendation: `repo/sync/` with `mod.rs` (enrollment), `capture.rs`, `apply.rs`, and `repair.rs`; item 1 moves the existing code without behavior change.

## Plan

- [ ] 1. Add the fake space and apply creates
  Goal: an apply entry point, `apply_page(db, page, starter)`, that decodes each entry, validates its header against the registry, and applies the page in one transaction, returning the kinds it changed for the engine's UI events.
  This item implements apply rule steps 1–3 for live and missing referents and step 6: insert if absent, with synthetic registers whose `product_ts` comes from `initial_product_ts`, and a `create` origin carrying the entry's sender metadata; overlay of a stamp-zero seed row (a seed id with no `create` origin); deck placeholders from the lowest live algorithm and template id; the device clock observes every applied stamp.
  A test-only fake space in `crates/koloda/tests/common/sync.rs`: `push(replica)` moves a replica's not-in-flight outbox rows into a shared log with consecutive seqs and the replica's device as sender; `pull(replica)` applies every later entry from another sender.
  Per the module-layout open question, move the existing sync code first; per the cursor open question, add the cursor columns in migration `V6__sync_cursors.sql` and refresh the embedded listings on both hosts and the schema inventory.
  Update the architectural map in `crates/koloda/README.md`, the accepted divergence in `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` (native repos also apply sync envelopes), and add an `agents/RUST.md` routing row for remote apply.
  Constraints: apply never goes through repo write paths that capture or record algorithm revisions, so a remote write never re-enters the outbox; an entry that does not decode fails the whole page and applies nothing; the fake space makes none of the server's checks (stale heads, existence, compaction), which the server task covers.
  Done when: harness tests create each kind on A and find equal rows on B, with synthetic registers at A's stamp and origins naming A; a create for an id B already holds is dropped; a stamp-zero seed row is overlaid by a remote seed create; a deck create applied without its pointers sits on the lowest-id placeholders; B's clock is past A's stamp.
  Commit: <candidates presented in chat>
  Depends on: none

- [ ] 2. Apply updates
  Goal: apply rule steps 7–9 for every update group: drop when the row is absent; compare `(hlc, stamp_device)` with the register, where equal plus synthetic wins once; apply the payload, replace the group's `product_ts`, and recompute `updated_at` as the max of the entity's register `product_ts` values and its `legacy_product_ts_floor`; write the register with the entry's sender metadata and `synthetic = 0`; delete a not-in-flight pending outbox row for the same group, and its cohort once empty.
  Learning groups patch one key of the `learning` document; a remote `algorithms.content` records no revision.
  Done when: harness tests cover a remote edit applied; a remote edit losing to a newer pending local edit, which stays queued; a newer remote edit discarding an older pending local one; an in-flight local row left alone; tied stamps; `updated_at` dropping back when a losing replica held a later product timestamp; a parameter apply that records no revision; a single learning key changed remotely.
  Commit: <candidates presented in chat>
  Depends on: 1

- [ ] 3. Apply reviews and resets
  Goal: apply rule step 5 for reviews: dropped unless the review's stamp strictly beats a non-synthetic `cards.reset` register, otherwise inserted with an origin.
  A winning `cards.reset` blanks scheduling at its stamp unless scheduling already beats it, and deletes the reviews that do not strictly beat it, with their origins, in the same transaction.
  A remote reset that kills a pending local grade drops both of that grade's outbox rows in the same transaction.
  Done when: harness tests cover a reset before and after a remote grade, a tied-HLC reset and grade, a reset arriving before its paired scheduling envelope, reviews arriving after their card's reset, and a pending local grade killed by a remote reset.
  Commit: <candidates presented in chat>
  Depends on: 2

- [ ] 4. Apply tombstones
  Goal: apply rule step 1 drops envelopes for a fenced entity or one under a fenced ancestor; step 4 records the `sync_tombstones` row with the entry's sender metadata and `successor`, then cascades in the page's transaction: a deck's cards and their reviews, a card's reviews, with their registers and origins.
  A tombstone for an id this replica does not hold is recorded as a fence; a later create of a fenced id is dropped.
  Pending local rows of a dead entity or its descendants are dropped with their cohorts.
  Per the cascade open question, reword `PROTOCOL.md` §Tombstones and §Client state.
  Done when: harness tests cover a deck deleted on A while B adds and edits a card in it (delete wins; the card is gone on both); a card deleted with its reviews; a tombstone for an unknown id that later fences its create; a pending local child dropped by a remote tombstone.
  Commit: <candidates presented in chat>
  Depends on: 3

- [ ] 5. Repair pointers to dead referents
  Goal: a template or algorithm tombstone sweeps decks and learning defaults pointing at it to the kind's repair target: the live `successor`, else the live row with the lowest id, else a new default row from the starter input (an algorithm with its revision); it then drops cards on a dead template with their reviews, and only then deletes the referent.
  A pointer or card create that arrives naming a tombstoned referent is repaired or dropped (§Deletes, Arrivals).
  Repairs and new default rows are captured as local writes.
  A separate call repairs learning defaults that name no live row, per the open question on its timing.
  Done when: harness tests cover an algorithm deleted with a successor on A while B switches a deck to it; a delete without a successor (lowest id); a dead successor; concurrent deletes of the last two algorithms and of the last two templates (each replica creates a default; pointers converge after exchange); a card created under a template deleted on the other replica; a stamp-zero learning default naming an absent seed id.
  Commit: <candidates presented in chat>
  Depends on: 4

- [ ] 6. Run the collision table through the fake space
  Goal: one test per row of `PROTOCOL.md` §Collision outcomes, except the attachment row, which needs transport; two replicas exchange in both orders and must end with the same rows and the outcome the row names.
  Add the §Conformance cases that need no server: reset applied after its reviews, reset against lower and higher scheduling heads, algorithm edited after a dependent deck create, rename on one device with notes or parameters on another, and an algorithm deleted while another device changes its parameters.
  Done when: every covered row and case has a passing test; `bun run check:push` is green.
  Commit: <candidates presented in chat>
  Depends on: 5

## Outcome

<what shipped>
