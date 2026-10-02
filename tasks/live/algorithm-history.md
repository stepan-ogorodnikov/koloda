# Algorithm history

Status: ready

## Intent

Record how an algorithm's scheduling parameters change over time, and who changed them.
Each change becomes an append-only revision: a full snapshot of the parameters, the actor, and a timestamp.
Revisions outlive the algorithm, so later features (review linkage, an FSRS optimizer, a history view) can rely on them.

Done when: on both hosts, creating an algorithm (add, clone, first-run seed) records its first revision, and every save that changes its parameters records one more, all with actor `user`; saves that change only title or notes, or change nothing, record none; deleting an algorithm keeps its revisions.

## Scope

In: ALGORITHMS.md history section; `algorithm_revisions` table (one shared migration, both hosts); shared actor shape; recording revisions on algorithm creation and update in the web store and the Rust store, atomic with the write.
Out: any UI; reading revisions through the app or assistant; linking reviews to revisions (`reviews.algorithm_revision_id`); actors other than `user` (assistant, fsrs, system); per-actor metadata beyond `kind`; restore or diff of revisions; recording deck-to-algorithm reassignment; backfilling revisions for algorithms that exist before the migration.

## Open questions

- [x] Store history in the `algorithms` row or a separate table? — separate append-only table. Rows need stable ids for later review linkage, must survive algorithm delete, and must not load on every algorithm read.
- [x] Snapshot or diff? — full snapshot of the parameters (`content`), the same JSON shape as `algorithms.content`.
- [x] Shape of the actor? — JSON tagged by `kind` (`{"kind":"user"}`); per-actor fields join later without a migration. No generic metadata bag.
- [x] What counts as a change? — `content` (retention, weights, fuzz, learning steps, relearning steps, maximum interval) differs from the stored value. Title and notes are not parameters.
- [x] Do creation paths (add, clone, first-run seed) record an initial revision? — yes.
- [x] Which actor do first-run seeds get? — `user`.
- [x] Does the migration backfill revisions for existing algorithms? — no; their history starts at their next parameter change.
- [x] Area guides? — `agents/DB.md`, `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`, `agents/FUNCTIONAL-SPECIFICATIONS.md`, `agents/MARKDOWN.md`; implementation adds `agents/RUST.md`, `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md`, `agents/TESTING.md`.
- [x] Spec placement? — its own first commit (human's call), ahead of the code that makes it true.

## Plan

- [x] 1. Specify algorithm parameter history
  Goal: docs/specs/ALGORITHMS.md gains a History section, and Core model gains a **Revision** term.
  Rules to state: creating an algorithm (add, clone, first setup) records its starting parameters; every save that changes parameters records the new parameters, when, and who made the change; the user is the only author for now; title and notes edits, and saves that change nothing, are not recorded; a rejected save records nothing; deleting an algorithm keeps its history; algorithms that existed before history was introduced start their history at their next parameter change; history is not shown anywhere in the product yet.
  Constraints: follow FUNCTIONAL-SPECIFICATIONS.md — behavior only, no table, column, or type names; one home per rule; Cloning and Deleting sections point at History rather than restating it.
  Done when: the spec reads coherently on its own; markdown lint passes.
  Commit: Specify algorithm parameter history
  Depends on: none

- [x] 2. Add the algorithm_revisions table on both hosts
  Goal: one new hand-written migration `crates/koloda/src/migrations/V4__algorithm_revisions.sql` creating `algorithm_revisions (id text PRIMARY KEY NOT NULL, algorithm_id text NOT NULL, content text NOT NULL, actor text NOT NULL, created_at integer NOT NULL)` with `CREATE INDEX IF NOT EXISTS` on `(algorithm_id, created_at)`; refresh the embedded listings on both hosts; regenerate the schema inventory.
  Constraints: next V after V3; never edit applied files; one shared SQL series for both hosts; no backticks; no foreign key to `algorithms` — revisions must outlive a deleted algorithm, and a NO ACTION FK would block the delete; no backfill.
  Done when: `cargo test -p koloda` green after touching `crates/koloda/src/migrations/mod.rs` (or `cargo clean -p koloda`); inventory regenerated with `cargo test -p koloda --test integration write_schema_inventory_snapshot -- --ignored`; `bunx nx test @koloda/db-sqlite` green after rebuilding `@koloda/db-sqlite` (or `nx reset`) so the Vite glob embeds V4.
  Commit: Add the algorithm_revisions table
  Depends on: none

- [x] 3. Record revisions in the web store
  Goal: shared `AlgorithmRevisionActor` type in libs/srs (tagged by `kind`, only `user` for now) next to the algorithm schemas; a plain type, not a Zod schema, since nothing parses actors yet.
  libs/db-sqlite `algorithms.ts`: a revision insert (uuidv7 id, parsed `content` as JSON, actor `{"kind":"user"}`, the same timestamp as the algorithm write); `addAlgorithm` inserts the algorithm and its first revision in one `db.transaction` (covers clone and `apps/web/src/app/setup.ts` seeding, which already passes its own transaction — nested calls join it); `updateAlgorithm` runs its read, update, and revision insert in one `db.transaction` and inserts a revision only when `content` changed.
  Constraints: change detection compares the parsed new `content` with the stored parsed `content`, not raw form strings; title-only, notes-only, and no-op saves insert nothing; `deleteAlgorithm` leaves revisions untouched; no read API for revisions (tests query the table directly); no IPC or electron mirror changes.
  Done when: `bunx nx test @koloda/db-sqlite` covers: add and clone record one revision with the starting snapshot; a parameter change appends one revision with the new snapshot and actor `user`; title/notes-only and no-op saves append none; a rejected save appends none; delete keeps revisions.
  Commit: Record algorithm parameter revisions in the web store
  Depends on: 2

- [ ] 4. Mirror revision recording in the Rust store
  Goal: Rust actor type in `crates/koloda/src/domain/algorithms.rs` (serde enum tagged `kind`, only `User`), serialized identically to the TS shape.
  `crates/koloda/src/repo/algorithms.rs`: `insert_algorithm` also inserts the first revision on the connection it is given (covers `add_algorithm`, clone, and `app/init.rs` seeding, which already runs in a transaction); `add_algorithm` switches to `db.with_transaction`; `update_algorithm` runs its read, update, and revision insert in `db.with_transaction` and inserts a revision only when `AlgorithmFSRS` differs (it derives `PartialEq`).
  Constraints: twin of item 3 — same rules, same JSON; mark twin sites with comments like the existing ones; no new NAPI surface; seed integration tests that insert algorithms with raw SQL stay as they are.
  Done when: `cargo test -p koloda` and clippy green with integration tests mirroring item 3's cases, plus first-run seeding recording a revision; `bun run check:push` green.
  Commit: Mirror algorithm revision recording in the Rust store
  Depends on: 2, 3

## Outcome

<what shipped>
