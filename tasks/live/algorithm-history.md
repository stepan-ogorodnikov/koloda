# Algorithm history

Status: draft

## Intent

Record how an algorithm's scheduling parameters change over time, and who changed them.
Each change becomes an append-only revision: a full snapshot of the parameters, the actor, and a timestamp.
Revisions outlive the algorithm, so later features (review linkage, an FSRS optimizer, a history view) can rely on them.

Done when: on both hosts, every save that changes an algorithm's parameters appends one revision with actor `user`; saves that change only title or notes, or change nothing, append none; deleting an algorithm keeps its revisions.

## Scope

In: `algorithm_revisions` table (one shared migration, both hosts); shared actor shape; recording revisions on algorithm writes in the web store and the Rust store, atomic with the write; ALGORITHMS.md history section.
Out: any UI; reading revisions through the app or assistant; linking reviews to revisions (`reviews.algorithm_revision_id`); actors other than `user` (assistant, fsrs); per-actor metadata beyond `kind`; restore or diff of revisions; recording deck-to-algorithm reassignment.

## Open questions

- [ ] Do creation paths (add, clone, first-run seed) record an initial revision? — open. Recommendation: yes, so each algorithm's history starts with its first parameters and any later revision has a predecessor.
- [ ] If yes, which actor do first-run seeds get (web `apps/web/src/app/setup.ts`, Rust `crates/koloda/src/app/init.rs`)? — open. Options: `user`, or a `system` kind added now.
- [ ] Does the migration backfill one revision per existing algorithm? — open. Without it, existing algorithms start with no history; with it, the backfilled actor is a guess.
- [ ] Area guides for this change (DB, backwards compatibility, Rust/TS parity)? — open; to be routed by the human.
- [x] Store history in the `algorithms` row or a separate table? — separate append-only table. Rows need stable ids for later review linkage, must survive algorithm delete, and must not load on every algorithm read.
- [x] Snapshot or diff? — full snapshot of the parameters (`content`), the same JSON shape as `algorithms.content`.
- [x] Shape of the actor? — JSON tagged by `kind` (`{"kind":"user"}`); per-actor fields join later without a migration. No generic metadata bag.
- [x] What counts as a change? — `content` (retention, weights, fuzz, learning steps, relearning steps, maximum interval) differs from the stored value. Title and notes are not parameters.

## Plan

- [ ] 1. Add the algorithm_revisions table on both hosts
  Goal: one new hand-written migration `crates/koloda/src/migrations/V4__algorithm_revisions.sql` creating `algorithm_revisions (id text PRIMARY KEY NOT NULL, algorithm_id text NOT NULL, content text NOT NULL, actor text NOT NULL, created_at integer NOT NULL)` with an index on `(algorithm_id, created_at)`; refresh the embedded listings on both hosts; regenerate the schema inventory.
  Constraints: next V after V3; never edit applied files; one shared SQL series for both hosts; no foreign key to `algorithms` — revisions must outlive a deleted algorithm, and a NO ACTION FK would block the delete; backfill only if the open question says so.
  Done when: `cargo test -p koloda` green after touching `crates/koloda/src/migrations/mod.rs` (or `cargo clean -p koloda`); inventory regenerated with `cargo test -p koloda --test integration write_schema_inventory_snapshot -- --ignored`; `bunx nx test @koloda/db-sqlite` green after rebuilding `@koloda/db-sqlite` (or `nx reset`) so the Vite glob embeds V4.
  Commit: <candidates presented in chat>
  Depends on: none

- [ ] 2. Record revisions in the web store
  Goal: shared actor schema in libs/srs (Zod discriminated union on `kind`, only `user` for now) next to the algorithm schemas; libs/db-sqlite `algorithms.ts` inserts a revision (uuidv7 id, parsed `content` as JSON, actor `{"kind":"user"}`, `nowMs()`) when `updateAlgorithm` changes `content`, and on creation paths per the open question; `updateAlgorithm` runs its read, update, and revision insert in one `db.transaction`.
  Constraints: change detection compares the parsed new `content` with the stored parsed `content`, not raw strings from the form; title-only or notes-only saves insert nothing; `deleteAlgorithm` leaves revisions untouched; no read API for revisions (tests query the table directly); no IPC or electron mirror changes.
  Done when: `bunx nx test @koloda/db-sqlite` and `bunx nx test @koloda/srs` cover: parameter change appends one revision with the new snapshot and actor `user`; title/notes-only and no-op saves append none; failed validation appends none; delete keeps revisions; creation paths match the resolved open question.
  Commit: <candidates presented in chat>
  Depends on: 1

- [ ] 3. Mirror revision recording in the Rust store and spec it
  Goal: Rust actor type in `crates/koloda/src/domain/algorithms.rs` (serde enum tagged `kind`, only `User`), serialized identically to the TS shape; `crates/koloda/src/repo/algorithms.rs` `update_algorithm` runs in `db.with_transaction` and inserts a revision when `AlgorithmFSRS` differs (it derives `PartialEq`); creation paths (`insert_algorithm`, used by `add_algorithm`, clone, and `app/init.rs` seeding) per the open question; docs/specs/ALGORITHMS.md gains a History section: parameter changes are recorded with who made them, title and notes edits are not, history survives delete, nothing in the product shows it yet.
  Constraints: twin of item 2 — same rules, same JSON, mark twin sites with comments like the existing ones; no new NAPI surface.
  Done when: `cargo test -p koloda` and clippy green with integration tests mirroring item 2's cases; `bun run check:push` green.
  Commit: <candidates presented in chat>
  Depends on: 1, 2

## Outcome

<what shipped>
