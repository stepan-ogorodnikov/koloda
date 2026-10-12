# FSRS parameter optimization

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, docs/specs/ALGORITHMS.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/DECISIONS.md, agents/MARKDOWN.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, docs/decisions/APP-ROLES.md, agents/RUST.md, apps/electron/README.md, apps/electron/IPC.md, libs/native-ipc/README.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/CSS.md, agents/I18N.md, agents/VERIFY.md
Flow: local

## Intent

A desktop user can fit an algorithm's FSRS weights to their own review history.
From the algorithm editor they start an optimization and see how many reviews it used.
They then see how well the current and the new weights predict those reviews.
They apply the new weights or discard them.
Applied weights are an ordinary parameter change: later grades use them, they sync, and the algorithm's history
records them with the optimizer as the author.

Done when:

- the desktop algorithm editor offers Optimize, and a run on a deck with reviews ends in one of three results:
  new weights to apply, current weights already fit best, or no reviews to learn from;
- applying writes the new weights and one revision whose author is the optimizer;
- the web demo shows no optimization, as `docs/decisions/APP-ROLES.md` allows;
- `docs/specs/ALGORITHMS.md` describes all of it;
- `docs/decisions/FSRS-OPTIMIZER.md` states where fitting runs and what it must agree on with the scheduler.

## Scope

In:

- `crates/koloda`: the `fsrs` crate, pinned exactly; training items built from review history; optimization and
  scoring; applying weights as a revision whose author is the optimizer.
- `apps/electron/src-rust`: optimization off the database thread, with progress and cancel.
- `apps/electron`: an optimizer IPC module, the `KolodaDb` mirror, `IPC.md`, `README.md`.
- `libs/native-ipc`: the optimizer channels and the progress event.
- `libs/core-react`: an optimizer queries atom that only the desktop sets, like `syncQueriesAtom`.
- `apps/electron-react`: optimizer queries over IPC.
- `libs/srs`: the outcome types and the `optimizer` revision author in `AlgorithmRevisionActor`.
- `libs/app`: new error codes and messages.
- `libs/srs-react`: the Optimize action and its dialog in the algorithm editor.
- The `en` and `ru` locales of every package touched.
- `docs/specs/ALGORITHMS.md`; `docs/decisions/FSRS-OPTIMIZER.md`, new;
  `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` and `agents/INDEX.md` point at it.

Out:

- Recomputing stored stability and difficulty of existing cards when weights are applied (human: later).
  Cards keep their stored numbers until their next grade, as ALGORITHMS.md already says for any parameter change.
- Automatic or scheduled optimization, and reminders to optimize (human: manual button only).
- Optimization in the web demo, including the WASM build of `@open-spaced-repetition/binding` (human: desktop only).
- FSRS-7 and ts-fsrs 6: a separate task once ts-fsrs 6 is stable.
  It changes the weight count on both sides and needs a migration for stored algorithms.
- Fitting desired retention, the retention simulator, and Cost ADR.
- An "ignore reviews before" date and per-search card filters.
  Resetting a card already deletes its history.
- Evaluating weights without optimizing, and any view of the algorithm's history.

## Open questions

- [x] Which apps? — desktop only (human, 2026-10-12).
- [x] What starts an optimization? — a manual button only (human, 2026-10-12).
- [x] Recompute existing cards' memory states on apply? — no, later (human, 2026-10-12).
- [x] Where does fitting run? — Rust `fsrs` crate in `koloda`, on desktop; scheduling stays in TypeScript.
  The reviews already live in Rust-owned SQLite, and the crate no longer depends on Burn.
- [x] Which model? — FSRS-6, the model ts-fsrs 5 schedules with (21 weights).
  The published `fsrs` 6.6.2 trains FSRS-6 only; its unreleased `main` trains FSRS-7 (34 weights) by default.
  The exact pin and the 21-weight check guard the handoff.
- [x] How are day gaps counted? — as ts-fsrs counts elapsed days: the difference of UTC calendar dates.
  Not the learning day from `dayStartsAt`; the fitted model must match the scheduler that uses it.
- [x] When are new weights offered? — only when their log loss on the same reviews is lower than the current
  weights' (Anki's rule); otherwise the result says the current weights already fit best.
- [x] What does the web algorithm editor show? — nothing, as the web shows no Sync settings (human, 2026-10-12).
- [x] Spec placement? — its own first commit, ahead of the code that makes it true (human, 2026-10-12).
- [x] Show training progress? — yes, a progress bar fed by a push channel, with Cancel (human, 2026-10-12).

## Plan

- [x] 1. Specify FSRS optimization
  Goal: `docs/specs/ALGORITHMS.md` describes optimization, ahead of the code that makes it true.
  Scope mentions optimization.
  Core model gains the term **Optimization**.
  A new Optimization section states the rules below.
  The user optimizes one algorithm from its editor, on the desktop only.
  The web app offers no optimization and shows nothing in its place, per `docs/decisions/APP-ROLES.md`.
  Optimization learns from the review history of the cards in decks that use the algorithm now.
  It runs on the saved parameters, so it is unavailable while the editor has unsaved changes.
  While it runs, the user sees progress and can cancel; closing the dialog cancels too, and nothing changes.
  It ends in one of three results:
  no reviews to learn from;
  the current weights already fit best;
  new weights that predict those reviews better.
  The last two show how many reviews were used and how well the current and the new weights fit them.
  Only new weights can be applied; the user applies or discards them.
  Applying changes only the weights, so it affects later grades like any parameter change (§Editing Algorithms).
  If the algorithm's parameters changed after the run started, applying is refused and the user can run again.
  Optimization never changes cards, reviews, title, or notes.
  History: a revision records who made the change, which is the user or the optimizer.
  A revision is also recorded when optimized weights are applied.
  Constraints: follow `agents/FUNCTIONAL-SPECIFICATIONS.md`; behavior only, with no crate, metric formula, model
  version, table, or type names; one home per rule.
  Done when: the spec reads coherently on its own; `bun run check:markdown` is green, and so are the spec tests
  that check headings and section pointers.
  Manual verify: none — docs only.
  Commit: Specify FSRS optimization
  Depends on: none

- [x] 2. Build FSRS training items from review history
  Goal: `crates/koloda` gains the `fsrs` crate and turns one algorithm's review history into FSRS-6 training items.
  Add `fsrs = "=6.6.2"` to `crates/koloda/Cargo.toml`.
  New Rust-only domain module `src/domain/optimizer.rs`, with no TS twin; its module doc points at
  `docs/decisions/FSRS-OPTIMIZER.md`.
  It holds a pure builder: given each card's reviews (rating, state before the grade, `created_at` in ms), it returns
  the training items, a card index per item, and the number of reviews used.
  Rules:
  sort each card's reviews by `created_at`, then id;
  drop a card whose first review's state is not New, since its history is incomplete;
  `delta_t` is 0 for the first review and otherwise the difference in UTC calendar dates between this review and the
  previous one, the same count as ts-fsrs `dateDiffInDays`;
  emit one item per prefix of a card's history that ends at a review with `delta_t > 0`;
  same-day reviews stay inside later prefixes;
  card ids map to dense `i64` indices, aligned with the items, for `ComputeParametersInput.card_ids`.
  New repo module `src/repo/optimizer.rs` loads the input in one read: the algorithm's stored content and the
  reviews of cards in decks whose `algorithm_id` is that algorithm, excluding `is_ignored` reviews.
  Not found is a `not-found.algorithms.optimize.algorithm` error, with its TS twin in `libs/app/src/lib/error.ts`.
  Write `docs/decisions/FSRS-OPTIMIZER.md` per `agents/DECISIONS.md`.
  Its ruling:
  fitting runs in `koloda` on the desktop, through the exactly pinned `fsrs` crate;
  scheduling stays in TypeScript;
  the handoff is the weights string, which has exactly `FSRS6_WEIGHT_COUNT` numbers;
  training requests FSRS-6 explicitly;
  day gaps are counted the way ts-fsrs counts elapsed days;
  bumping the crate, ts-fsrs, or the model version is one change across both;
  the web demo has no optimizer.
  In `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`, the FSRS row and the "do not move FSRS into Rust" rule point at
  the new file for fitting.
  `agents/INDEX.md` gains a row for the optimizer: the decision, `docs/specs/ALGORITHMS.md`, `agents/RUST.md`.
  Constraints: `domain/` stays free of `rusqlite`; no schema change; no NAPI or TS changes beyond the error code.
  Done when: domain tests cover a gap across UTC midnight, two reviews on one UTC date, the first-review rule,
  the same-day prefix rule, and card index alignment.
  Integration tests show that only the algorithm's decks count and ignored reviews do not.
  `cargo test -p koloda`, `bun run check:rust`, and `bun run check:markdown` are green.
  `cargo tree -p koloda` shows `fsrs v6.6.2` and no `burn`.
  Commit: Build FSRS training items from review history
  Depends on: 1

- [x] 3. Optimize algorithm weights and score them against the current ones
  Goal: a pure `optimize` in `src/domain/optimizer.rs` takes the loaded input and an
  `Arc<Mutex<fsrs::CombinedProgressState>>`, and returns an outcome.
  With no training items, the outcome is `notEnoughData` with the review count.
  Otherwise call `compute_parameters` with `enable_short_term: true`, `num_relearning_steps` set to the algorithm's
  relearning step count, and the card indices from item 2.
  The pinned 6.6.2 trains FSRS-6 only and has no model-version field.
  Reject output that is not exactly `FSRS6_WEIGHT_COUNT` finite numbers with `algorithms.optimizer.invalid-output`.
  Score the current and the new weights on the same items with `FSRS::new(..)?.evaluate(..)`: log loss and RMSE.
  When the new log loss is not lower, the outcome is `noImprovement` with both scores.
  Otherwise it is `improved` with both scores and the new weights.
  The weights are formatted to 4 decimals and joined with `", "`, as the defaults are,
  and pass `AlgorithmFSRS::validate`.
  Every outcome but `cancelled` carries `reviewCount` and `basedOn`, the stored content the run read,
  for the stale check in item 4.
  The crate's `Interrupted` error, raised after `want_abort` is set, becomes a `cancelled` outcome.
  Other crate errors map to `algorithms.optimizer.failed`.
  Outcome types serialize camelCase, tagged by `status`.
  Their TS twins go in `libs/srs/src/lib/algorithms.ts`, and the error codes and messages in
  `libs/app/src/lib/error.ts`.
  Constraints: no threads here, since the addon decides where `optimize` runs; no repo writes.
  Done when: domain tests on a synthetic history show that `improved` returns weights that validate.
  Running again with those weights as current returns `noImprovement`.
  Empty input returns `notEnoughData`; setting `want_abort` before the call returns `cancelled`.
  `cargo test -p koloda`, `bun run check:rust`, and the `libs/app` error-parity test are green.
  Commit: Optimize algorithm weights against review history
  Depends on: 2

- [x] 4. Apply optimized weights as an optimizer revision
  Goal: `AlgorithmRevisionActor` gains `Optimizer` (`{"kind":"optimizer"}`) in
  `crates/koloda/src/domain/algorithms.rs`, and its TS twin in `libs/srs/src/lib/algorithms.ts` gains the same kind.
  `insert_algorithm_revision` in `src/repo/algorithms.rs` takes the actor; existing callers pass `User`.
  New `apply_algorithm_optimization(db, { id, basedOn, weights })` runs in one transaction.
  It reads the stored content; if that is not equal to `basedOn`, it fails with `algorithms.optimizer.stale` and
  writes nothing.
  Otherwise it replaces only the weights, validates, updates `content` and `updated_at`, and records one revision
  with actor `Optimizer`.
  It captures the content and revision envelopes the way `update_algorithm` does.
  Title and notes are untouched.
  A missing algorithm is `not-found.algorithms.optimize.algorithm`.
  Constraints: no sync protocol change, since the revision actor travels as an opaque string and remote apply
  stores it verbatim; no web store change, since the web never applies optimizations.
  Done when: integration tests show that apply writes the weights and one `{"kind":"optimizer"}` revision, and
  captures both envelopes.
  A stale `basedOn` writes nothing and captures nothing.
  Title and notes stay as they were.
  `cargo test -p koloda`, `bun run check:rust`, and `bun run typecheck` are green.
  Commit: Apply optimized weights as an optimizer revision
  Depends on: 3

- [ ] 5. Run the FSRS optimizer from the desktop app
  Goal: the addon (`apps/electron/src-rust/src/lib.rs`) gains `optimize_algorithm({ requestId, id })`,
  `cancel_algorithm_optimization({ requestId })`, and `apply_algorithm_optimization(data)`.
  Optimize loads its input on the database thread, then trains on a dedicated optimizer thread.
  It never blocks the database or sync threads.
  Runs queue on that thread in order.
  Progress (current, total), polled from the crate's progress state, is pushed to JS keyed by `requestId`.
  Cancel sets `want_abort` for that request.
  Apply is a product write: it runs through the database thread's write path and tells the sync engine a local
  commit happened, as other writes do.
  Main: new `apps/electron/src/optimizer-ipc.ts`, modelled on `sync-ipc.ts`.
  It handles `cmd_optimize_algorithm`, `cmd_cancel_algorithm_optimization`, and `cmd_apply_algorithm_optimization`,
  and forwards progress to the requesting window on `OPTIMIZER_PROGRESS_CHANNEL`.
  The new methods go in the `KolodaDb` mirror (`src/koloda-db.ts`).
  `libs/native-ipc`: the three channels in `DataIpc`, the channel constant, and the progress event type.
  `libs/core-react`: an `OptimizerQueries` type and an `optimizerQueriesAtom` (null by default), like
  `syncQueriesAtom`; not a `Queries` method.
  `apps/electron-react`: the IPC implementation of `OptimizerQueries`, set in `src/app/store.ts`.
  Docs: an Optimizer section in `apps/electron/IPC.md`; the electron and electron-react README maps.
  Constraints: the web app sets no optimizer queries; no UI in this item.
  Done when: `apps/electron` unit tests, modelled on `sync-ipc.test.ts`, cover routing, progress forwarding, and
  cancel.
  `bunx nx run @koloda/electron:test -c unit`, `bun run typecheck`, and `bun run check:rust` are green.
  Manual verify: none — no UI reaches it until item 6.
  Commit: Run the FSRS optimizer from the desktop app
  Depends on: 4

- [ ] 6. Add FSRS optimization to the algorithm editor
  Goal: `libs/srs-react/src/lib/algorithms/` gains `optimize-algorithm.tsx`, an Optimize action in the editor's
  actions next to Clone and Delete.
  It renders only when `optimizerQueriesAtom` is set, so the web shows nothing.
  It is disabled while the editor has unsaved changes, because optimization uses the saved parameters.
  The dialog shows progress with Cancel while running.
  Then it shows one of these:
  no reviews to learn from;
  current weights already fit best, with both scores;
  new weights with the review count and both scores (log loss and RMSE), with Apply and Discard.
  Apply calls the apply mutation, then refreshes the algorithm queries and resets the form as a save does.
  A stale refusal says the parameters changed since the run and offers to run again.
  Closing the dialog while running cancels the run.
  Strings in `en` and `ru`, extracted and compiled per `agents/I18N.md`.
  Constraints: the optimizer does not touch card scheduling numbers; follow `agents/CSS.md` for classes.
  Done when: component tests, modelled on `delete-algorithm.test.tsx`, cover these cases:
  hidden without the atom;
  disabled when dirty;
  improved → Apply calls the mutation with `basedOn` and the weights;
  `noImprovement` and `notEnoughData` offer no Apply;
  Cancel calls cancel.
  The dialog matches `docs/specs/ALGORITHMS.md` (§Optimization).
  `bun run check:push` is green.
  Manual verify (desktop): open a preset with reviewed cards, Optimize, Apply → the weights field shows the new
  weights; Optimize on a preset with no reviews shows no reviews to learn from; edit the title without saving →
  Optimize is disabled.
  Commit: Add FSRS optimization to the algorithm editor
  Depends on: 5

## Outcome

<what shipped>
