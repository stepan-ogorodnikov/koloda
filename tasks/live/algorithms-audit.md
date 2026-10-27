# Algorithms audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, docs/specs/ALGORITHMS.md, docs/decisions/FSRS-OPTIMIZER.md, agents/RUST.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/VERIFY.md, agents/CSS.md, agents/I18N.md, agents/BACKWARDS-COMPATIBILITY.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/DECISIONS.md, agents/MARKDOWN.md, apps/electron/IPC.md, libs/native-ipc/README.md, apps/electron/README.md, apps/web-e2e/README.md, apps/electron-e2e/README.md, libs/e2e/README.md, agents/REVIEW.md
Flow: local

## Intent

Settle every finding of the algorithms audit as one task.

- The audit covered the behavior owned by `docs/specs/ALGORITHMS.md`, with the FSRS optimizer that
  `docs/decisions/FSRS-OPTIMIZER.md` governs.
  That is parameters, add, clone, edit, optimize, delete with a successor, and parameter history.
  The audit report (`algorithms.md` in the audit series) was written at `d32fb02e` (`main`).
- Its finding 2 was fixed by `tasks/archive/lessons-audit.md` (item 1, `c01fa539`).
- Its finding 6 and the clone-algorithm bullet of finding 11 were fixed by `tasks/archive/decks-audit.md`
  (items 4 and 2, `8ea0c2df` and `9ba5b114`).
- Those are recorded here, not planned.

This file restates every finding and its evidence, so neither the next session nor the archive reader needs the report.

Triage checked each finding again at `9a60b418`, where this task branches.
Since `d32fb02e`, the algorithm code changed only under the lessons, cards, decks, and assistant tasks:

- `algorithm.tsx` lost its mount-only reset and keeps synced values in untouched fields (decks items 4 and 5);
- `add-algorithm.tsx` and `clone-algorithm.tsx` await the write (decks item 2);
- the lesson-data query sets `gcTime: 0` (lessons item 1);
- ALGORITHMS.md says some characters count as two toward the title and notes limits (decks item 10).

The optimizer (`crates/koloda/src/domain/optimizer.rs`, the addon's `optimizer.rs`, the dialog), the FSRS domain on
both hosts, the web algorithm repo, the Rust algorithm tests, and the algorithm e2e specs are unchanged.
Every remaining finding holds.
The audit's probes were not re-run; the code they exercised is unchanged.
Line numbers below are at `9a60b418`.

The report's verdict: the optimizer is well built.
Its domain module is pure, the day count matches ts-fsrs, apply is one guarded transaction, and cancel works across
three processes with gated tests at each hop.
The CRUD and history paths agree across hosts statement for statement.
The debt sits where the optimizer meets the scheduler and the UI, plus a few test holes.

Done when, in user-visible terms:

- the optimizer never offers untrained weights as a better fit; it reports Not enough reviews instead;
- with two or more relearning steps, the optimizer's scores describe the weights the scheduler will use;
- step amounts and the maximum interval take only whole numbers, and a fraction in a payload names its field;
- a run cancelled before it starts resolves as cancelled, as IPC.md says;
- a ts-fsrs change to the elapsed-day count or the w17/w18 cap fails a test, and ts-fsrs is pinned exactly;
- the Russian labels and errors name each algorithm field alike;
- ALGORITHMS.md has one home per rule;
- the algorithm repos, Rust validation, the optimizer host, the dialog, and the preset e2e flows check outcomes;
- a desktop e2e flow runs the optimizer;
- `bun run check:push` passes on the tip, and every plan item is one commit with a `Task:` trailer.

## Scope

Entries use the report's numbers with the prefix `A`.

- A1. Spec violation, Should-fix: a fractional step amount or maximum interval saves to the generic error.
  Decision: fixed by item 7.
  - ALGORITHMS.md §Parameters line 49: "Maximum interval — number of days; must be greater than zero".
    Line 53: "The amount must be at least one."
    Neither says whole number.
  - Both step lists' amounts and the maximum interval are `z.number().int()`
    (`libs/srs/src/lib/algorithms-fsrs.ts:33`, `:44`).
    On desktop they are `i64` (`crates/koloda/src/domain/algorithms_fsrs.rs:18-20`), so serde rejects a fraction
    before `validate()` runs.
  - The fields accept fractions.
    `NumberField` sets only `formatOptions={{ useGrouping: false }}`
    (`libs/ui/src/lib/primitives/form/number-field.tsx:19`).
    The step fields and the maximum interval pass `minValue={1}` and no `step`
    (`libs/srs-react/src/lib/algorithms/algorithm-learning-steps.tsx:23-33`, `algorithm.tsx:143-147`).
    Without a step, react-stately clamps a typed value and does not round it.
  - The audit's probe: `[1.5, "m"]` as a learning step, `[2.5, "m"]` as a relearning step, and a `maximumInterval`
    of `10.5` each failed with only zod's "Invalid input: expected int, received number".
    That is not a key of `ERROR_MESSAGES`, so `Errors` shows "unknown" (`libs/ui/src/lib/primitives/form/form.tsx:74`).
  - Scenario: the user types 1.5 as a step amount and saves.
    The editor shows the generic error with no field named, and the save is refused.
  - With `maximumFractionDigits: 0`, React Aria's parser rejects a typed decimal separator
    (`@internationalized/number`, `NumberParser` `isValidPartialNumber`).
- A2. Spec violation, Should-fix: a reopened lesson graded with the parameters cached before a save or apply.
  Decision: fixed by `lessons-audit` item 1 (`c01fa539`, on `main`); nothing planned here.
  The lesson-data query sets `gcTime: 0`, so the next lesson reads the saved parameters
  (`libs/srs-react/src/lib/lessons/use-lesson-session.ts:76-79`).
- A3. Spec violation, Later: IPC.md says a cancelled run resolves as cancelled; an empty one does not.
  Decision: fixed by item 1.
  - `apps/electron/IPC.md` §FSRS Optimizer (line 134): `cmd_cancel_algorithm_optimization` "flags the run and
    returns at once; the run resolves as `cancelled`."
  - `optimize` returns `NotEnoughData` before it checks the abort flag
    (`crates/koloda/src/domain/optimizer.rs:195-203`).
    A run cancelled while it waits behind another run, on an algorithm with nothing to learn from, resolves
    `notEnoughData`.
    It still reads the database and builds the training set first (`apps/electron/src-rust/src/optimizer.rs:59`).
  - The audit's probe: `request_abort`, then `optimize` on no reviews, returned `NotEnoughData`.
  - No user sees it: the dialog drops results of stopped runs (`optimize-algorithm.tsx:52-66`).
  - IPC.md §Conventions (lines 21-24) says the `DataIpc` contract covers "every data, AI, and media command" and the
    AI stream payload.
    It also covers the sync and optimizer commands and their push payloads (`libs/native-ipc/src/index.ts`).
- A4. Spec hygiene, Later: ALGORITHMS.md lists Title as a parameter and restates rules.
  Decision: fixed by item 8.
  - `agents/FUNCTIONAL-SPECIFICATIONS.md` (Principles: one home per rule; Core model: a glossary, not a preview).
  - §Parameters lists Title under "Every algorithm is FSRS and has" (line 43).
    The Core model's Parameters exclude it (line 26), and §History treats it as not a parameter (line 190).
    The title rule is also in §Adding Algorithms (lines 73-76).
  - Lines 103-104 restate lines 18-19 (later grades change; existing numbers do not).
    DECKS.md points at §What it is as the home.
  - The last-algorithm rule is in §Relationships (line 37) and again in §Deleting Algorithms (line 161).
  - Scope states the same out-of-scope twice (line 7, then lines 9-10).
  - Line 118 says optimization learns from "every review".
    It skips reviews marked ignored (`crates/koloda/src/repo/optimizer.rs:37`) and cards whose history does not start
    at New (`domain/optimizer.rs:101-103`).
    No product path writes an ignored review, so this is wording, not behavior.
- A5. Risk, Should-fix: with two or more relearning steps, the optimizer fits and scores w17/w18 under caps the
  scheduler does not use.
  Decision: fixed by item 4.
  - FSRS-OPTIMIZER.md §Why: training must see days the way the scheduler does, "so the two must change together".
    The ruling names the weight count and the day count; the w17/w18 cap is a third point of agreement.
  - ts-fsrs 5.2.3 `clipParameters` caps w17 and w18 at `clamp(+v.toFixed(8), 0.01, 2)` when there are two or more
    relearning steps (`node_modules/ts-fsrs/dist/index.mjs:540-552`).
    `v = -(ln w11 + ln(2^w13 - 1) + 0.3·w14) / n`, where `n` is the relearning-step count.
    The scheduler takes `n` from the algorithm (`generatorParameters`, `:600-610`; `createFSRSAlgorithm` passes the
    steps).
  - The crate trains under `min(sqrt(max(v, 0.01)), 2)` (`fsrs-6.6.2/src/parameter_clipper.rs:51-58`), with `n` from
    `num_relearning_steps` (`domain/optimizer.rs:210`).
  - Scoring uses `FSRS::new`, which clamps with the default single relearning step, a cap of 2
    (`fsrs-6.6.2/src/model.rs:115-120`; `domain/optimizer.rs:260-261`).
  - The audit's probe, default weights (stored w17 = 0.5425):

    | Relearning steps | ts-fsrs schedules w17 | Crate training cap | Scoring cap |
    | --- | --- | --- | --- |
    | 1 | 0.5425 | 2 | 2 |
    | 2 | 0.3606 | 0.6005 | 2 |
    | 3 | 0.2404 | 0.4903 | 2 |

  - The web seed "Complex" has two relearning steps; on desktop a user adds a second step in the editor.
  - Scenario: a preset with relearning steps of 10 minutes and 1 hour is optimized.
    The found w17 can sit anywhere under 0.6005, and the dialog scores both weight sets with w17 uncapped.
    After Apply, every grade runs with w17 cut to about 0.36, so neither score describes the scheduler.
- A6. Risk, Should-fix: on desktop, a dirty editor wrote back parameters that sync had just changed.
  Decision: fixed by `decks-audit` item 4 (`8ea0c2df`, on `main`); nothing planned here.
  The editor keeps synced values in groups the user has not changed (`algorithm.tsx:29`, `:56`).
- A7. Risk, Later: nothing guards the day count on the TypeScript side.
  Decision: fixed by item 5; ts-fsrs is also pinned exactly (question 3).
  - FSRS-OPTIMIZER.md §Ruling: days are counted "the way ts-fsrs counts elapsed days".
    §Applies when names a ts-fsrs bump.
  - The crate is pinned exactly (`crates/koloda/Cargo.toml:33`, `fsrs = "=6.6.2"`).
    ts-fsrs is a caret range (`package.json:72`, `"ts-fsrs": "^5.2.3"`); only `bun.lock` holds it at 5.2.3.
  - Rust pins the UTC-midnight gap (`gap_across_utc_midnight_counts_one_day_even_minutes_apart`,
    `crates/koloda/tests/domain/optimizer_training_tests.rs:25`).
    No `libs/srs` test pins what ts-fsrs counts.
  - Scenario: a lockfile refresh takes a ts-fsrs 5.x that counts elapsed days differently.
    Every test passes, and the optimizer fits a model the scheduler no longer matches.
- A8. Improvement, Should-fix: no automated test crosses the desktop optimizer path.
  Decision: fixed by items 10 and 11.
  - Each hop is tested against a fake of the next: the dialog (`optimize-algorithm.test.tsx`), the renderer queries
    (`optimizer-queries.test.ts`), main (`optimizer-ipc.test.ts`), and the Rust domain without the addon.
  - The addon's `OptimizerHost` has no test (`apps/electron/src-rust/src/optimizer.rs`).
    Untested: its INVARIANT that a run is registered before it is queued (`:35-41`), a cancel of a queued run
    (`:43-47`), and the removal of finished runs (`:82`).
    `run` takes a NAPI `ThreadsafeFunction` for progress (`:57`), which a plain Rust test cannot build.
  - The `KolodaDb` mirror is a hand-written TS type.
    Nothing checks it against the NAPI method's `{ requestId, id }` or the progress payload.
  - No e2e spec optimizes (`rg -li optimiz apps/electron-e2e/src libs/e2e/src` finds nothing).
  - `tasks/archive/fsrs-optimizer.md` records the desktop manual verification as not checked.
- A9. Improvement, Should-fix: test gaps on both hosts.
  Decision: fixed by items 3 (small histories), 7 (fraction codes), and 9; the mid-run cancel case is skipped.
  - `agents/TESTING.md`: Layers (a full-field roundtrip per entity), Write tests for (a threshold at the limit and one
    past; exact error codes), and the twin rule.
  - Web roundtrip: "updates algorithm title and content" checks two content fields with `toMatchObject`
    (`libs/db-sqlite/src/lib/algorithms.integration.test.ts:187-207`).
    Notes are written in one revision case and never read back.
    Weights, steps, and maximum interval are never changed and compared.
  - Rust validator codes: 23 of the 33 tests in `crates/koloda/tests/domain/algorithms_fsrs_tests.rs` assert only
    `is_err()`, and none names a code.
    The TS twin asserts each code (`algorithms-fsrs.test.ts:217-337`).
    A Rust validator that returned the learning-step code for a relearning step would pass.
  - Retention bounds: both sides reject 69.9 and 99.1 (`algorithms-fsrs.test.ts:218-227`,
    `algorithms_fsrs_tests.rs:121-150`).
    The whole-number rule rejects those anyway, so a bound moved to 69 or 100 still passes.
  - Optimizer outcomes: no test covers a history below the crate's training floors (A13), or a cancel during
    training or scoring.
    Only an abort set before the call is tested (`optimizer_tests.rs:176-188`).
  - Dialog: no test covers a stale apply showing the refusal with Try again (`optimize-algorithm.tsx:88-90`,
    `:112-116`), or a closed run's late result being ignored (`:52-66`).
  - Web successor: "rejects deleting a referenced algorithm without a valid successor" passes a missing id
    (`algorithms.integration.test.ts:146-156`) and does not check that the deck kept its algorithm.
    The `!successorId` branch (`libs/db-sqlite/src/lib/algorithms.ts:108`) has no web test.
    Rust has both (`crates/koloda/tests/integration/algorithms_integration_tests.rs`).
  - Skipped: a cancel during training or scoring.
    The crate has no hook to stop between batches, so a test would order the abort by sleeping or polling.
    `agents/TESTING.md` bans both.
    The before-run abort (item 1) and the host's queued cancel (item 10) are tested.
- A10. Improvement, Later: the preset e2e specs skip outcomes (web lines; the desktop copies match).
  Decision: fixed by item 12.
  - `algorithm-reset.spec.ts:58` "changes" the maximum interval to 36500, the default it started from.
    So the Discard check on it (`:76`) cannot fail.
  - `algorithm-edit.spec.ts` edits only the title and retention.
    No spec saves weights, steps, maximum interval, or notes.
    None saves invalid parameters to check §Parameters line 60 ("Invalid parameters are rejected on save").
  - `algorithm-delete.spec.ts:9-49` deletes with a successor and checks only that the preset is gone, not that the
    deck moved to the successor.
  - `algorithm-delete.spec.ts:64-85` ("prevents deleting the last remaining algorithm") ends on "Simple", which is
    also the learning default, so the default guard alone disables Delete.
    The UI cannot reach the last-algorithm guard alone: the default cannot be deleted, so the last preset left is the
    default.
    The integration tests on both hosts cover that guard.
  - `algorithm-add.spec.ts:13-22` checks that the dialog stays open after an empty title, not that an error shows.
- A11. Improvement, Later: leftover residue and duplication.
  Decision: items 2 and 13; the clone-algorithm bullet was fixed by `decks-audit` item 2 (`9ba5b114`).
  - `reviewCount` on `notEnoughData` is always 0 by construction: no items means no card contributed
    (`domain/optimizer.rs:59-78`, `:195-199`).
    The UI never shows it (`optimize-algorithm.tsx:181-182`), and a test pins the 0 (`optimizer_tests.rs:165-171`).
    After item 3 it would carry a real count; it is dropped anyway (question 5).
  - The `cancelled` result's copy is unreachable in the dialog (`optimize-algorithm.tsx:179-180`).
    Every renderer cancel goes through `stop`, which clears `runRef` first (`:42-45`), so the result is dropped
    (`:62`).
    Main cancels only for a destroyed window.
  - The four unit ids are listed twice in one file, as `LEARNING_STEPS_UNITS` with labels and `LEARNING_STEP_UNITS`
    (`algorithms-fsrs.ts:8-13`, `:22`); the two names differ by one letter.
  - The progress-bar track class is copied from `libs/srs-react/src/lib/components/learned-today.tsx:90` to
    `optimize-algorithm.tsx:155`, both as long inline strings (`agents/CSS.md` §Static className).
  - Scoring calls `evaluate` (`domain/optimizer.rs:261`), which walks every prefix item.
    The crate's `evaluate_with_card_ids` (`fsrs-6.6.2/src/inference.rs:450`) computes each card's trajectory once.
    Its doc states the same per-item predictions and log loss; `optimize` already builds the card ids.
    Each run scores twice, so a long history paid the quadratic cost twice.
  - Fixed: `clone-algorithm.tsx` awaited nothing and kept Submit enabled while pending (`decks-audit` item 2).
- A12. Improvement, Later: the Russian catalog misspells retention and names fields differently in errors.
  Decision: fixed by item 6, with the labels' terms (question 4).
  - The retention label is "Коэфициент" (`libs/srs-react/locales/ru/messages.po:145`), a misspelling of
    "Коэффициент".
    Its error says "Удержание" (`libs/app/locales/ru/messages.po:482`).
  - The step lists are "Интервалы заучивания" and "Интервалы переучивания"
    (`libs/srs-react/locales/ru/messages.po:129`, `:141`).
    Their errors say "шага обучения" and "шага переобучения" (`libs/app/locales/ru/messages.po:462`, `:466`, `:474`,
    `:478`).
  - The `en` labels and errors use the same words.
- A13. Product decision, Should-fix: on a handful of reviews, the optimizer offers untrained weights as a better fit.
  Decision: fixed by item 3; a result the crate did not train is Not enough reviews (question 2).
  - ALGORITHMS.md §Optimization line 130: Not enough reviews means the cards have no reviews it can learn from.
    Line 132: New weights are weights that predict the reviews better.
    The spec sets no minimum.
  - The pinned crate (`fsrs-6.6.2/src/training.rs:337-354`):
    below 8 training items `compute_parameters` returns `DEFAULT_PARAMETERS`.
    Below 64, or when every item is a card's first, it returns the defaults with only the four initial stabilities
    fitted.
    Both counts are taken after its outlier pass.
  - `optimize` scores whatever comes back against the current weights and offers it when its log loss is lower
    (`domain/optimizer.rs:205-257`).
    The dialog says "Found weights that fit your reviews better." with the review count.
  - The audit's probe, with fitted current weights:

    | History | Result | Found weights |
    | --- | --- | --- |
    | 1 card, Good then Again 2 days later | improved, 2 reviews | exactly the built-in defaults |
    | 7 cards, 2 reviews each | noImprovement, 14 reviews | — |
    | 20 cards, 3 reviews each | improved, 60 reviews | first four refitted, the other 17 the defaults |

  - Clone copies the source's weights (§Cloning Algorithms), so fitted weights often sit on a preset whose decks have
    few reviews.
  - Scenario: the user clones a well-fitted preset for a new deck, studies a little, and presses Optimize.
    The dialog offers weights that "fit your reviews better, based on 60 reviews".
    Applying them resets 17 fitted weights to the defaults.

### Out

- `host-desync.md` finding 2 (the web parses algorithm rows with the write schema on every read).
  It stays with the host-desync triage.
- `decks.md` finding 2 (the specs said "characters"): fixed by `decks-audit` item 10.
- `apps/electron/src-rust/src/e2e_secrets.rs`: still read by no audit (tracker gap).
- Algorithm sync capture and apply, and how the assistant lists presets: audited by their own reports.
- The addon reads the database before `optimize` checks the abort flag (`apps/electron/src-rust/src/optimizer.rs:59`).
  After item 1 the outcome is right; only the read is wasted.
  Seen, not planned.

## Open questions

- [x] 1. Task shape? — the algorithms report alone.
  The tracker listed `templates.md` first; the human named algorithms as next (2026-10-27).
- [x] 2. A13: what decides Not enough reviews? — a result whose weights 5–21 still equal the crate's
  `DEFAULT_PARAMETERS`: the crate did not train.
  That matches all three of the pinned crate's floors; the spec states no number (human, 2026-10-27).
  The 64-item floor counted before the crate was not taken: the crate's outlier pass runs after such a count.
- [x] 3. A7: pin ts-fsrs? — yes, exactly at 5.2.3, plus the `libs/srs` day-count test (human, 2026-10-27).
- [x] 4. A12: which Russian terms? — the labels' terms: "Удержание" for retention, "интервал заучивания" and
  "интервал переучивания" for the steps (human, 2026-10-27).
- [x] 5. A11: `notEnoughData.reviewCount` after A13? — drop it; the dialog does not show it (human, 2026-10-27).
- [x] 6. Flow? — `local`, the default.
- [x] 7. Plan approved as written (human, 2026-10-27).

## Plan

`SRS`, `SR`, and `DB` below stand for `bunx vitest run --config <dir>/vitest.config.mjs --configLoader runner`.
Their dirs are `libs/srs`, `libs/srs-react`, and `libs/db-sqlite`.
`RS` stands for `cargo test -p koloda`; `ADDON` for `nx run @koloda/electron:test-rust`.
Line numbers are at `9a60b418`; when an earlier item moved them, find the code by its text.

- [ ] 1. Resolve an optimization cancelled before it starts as cancelled
  Goal (A3):
  - `optimize` (`crates/koloda/src/domain/optimizer.rs:192-203`): check `is_aborted(progress)` first, before the
    empty-set return.
  - `abort_requested_before_the_run_cancels_it` (`crates/koloda/tests/domain/optimizer_tests.rs:176-188`): make it a
    table over the forgetful history and no reviews; both resolve `Cancelled`.
  - IPC.md §Conventions (lines 21-24): the `DataIpc` contract also covers the sync and optimizer commands and their
    push payloads.
    Name them from `libs/native-ipc/src/index.ts`.
  Constraints: the domain function, its test, and IPC.md; the addon is unchanged.
  Done when:
  - `RS --test domain optimiz` passes;
  - the no-reviews row fails with the old order;
  - `bun run check:markdown` passes.
  Manual verify: none — the dialog drops a stopped run's result, so no user sees the change.
  Commit: Resolve an optimization cancelled before it starts as cancelled
  Depends on: none

- [ ] 2. Drop unused optimizer outcome parts and score each card once
  Goal (A11: the count, the cancelled copy, scoring):
  - Drop `review_count` from `OptimizationOutcome::NotEnoughData` (`domain/optimizer.rs:152-155`, `:196-199`) and
    `reviewCount` from its TS twin (`libs/srs/src/lib/algorithms.ts:48`).
    Update `histories_without_a_later_day_are_not_enough_data` (`optimizer_tests.rs:134-174`) and the dialog test row
    (`libs/srs-react/src/lib/algorithms/optimize-algorithm.test.tsx:118`).
    No shim (`agents/BACKWARDS-COMPATIBILITY.md`): the outcome is never stored, and both sides ship together.
  - Drop the dialog's `cancelled` copy (`optimize-algorithm.tsx:179-180`) and its catalog entries.
    The outcome type keeps `cancelled`: IPC.md lists it, and main cancels for a destroyed window.
    The dialog renders nothing for it, with a WHY: every renderer cancel goes through `stop`, which clears `runRef`
    first (`:42-45`), so the result is dropped (`:62`).
    Extract and compile both apps per `agents/I18N.md`; keep only that message's catalog changes.
  - `score` (`domain/optimizer.rs:260-261`): call `FSRS::evaluate_with_card_ids` with `set.card_indices`, which
    `optimize` already builds for training.
    WHY: it computes each card's trajectory once; `evaluate` walks every prefix item, and each run scores twice.
  Constraints:
  - No other outcome or IPC change; IPC.md line 130 lists only statuses and stays.
  - The existing improved and no-improvement tests (`optimizer_tests.rs:65-132`) pass unchanged with the new scoring.
  Done when:
  - `RS --test domain optimiz`, `SRS algorithms`, `SR optimize-algorithm`, and `bun run typecheck` pass;
  - `bun run check:rust` passes.
  Manual verify: none — the dialog shows the same results.
  Commit: Drop unused optimizer outcome parts and score each card once
  Depends on: 1

- [ ] 3. Report untrained optimizer results as not enough reviews
  Goal (A13; question 2):
  - `optimize`, after `compute_parameters` succeeds: when `trained[4..]` equals `fsrs::DEFAULT_PARAMETERS[4..]`, the
    crate did not train.
    Check the abort flag, then return `NotEnoughData`, so a cancelled run still resolves `Cancelled` (item 1).
  - WHY above the check, citing the pinned crate (`fsrs-6.6.2/src/training.rs:337-354`):
    below 8 training items it returns its defaults; below 64, or when every item is a card's first, it fits only the
    four initial stabilities.
    Those paths copy the constant, and real training moves the other weights off it, so exact equality is safe.
    A crate bump revisits it (FSRS-OPTIMIZER.md, the crate pin).
  - Tests in `optimizer_tests.rs`, one table, with current weights that are not the defaults (the audit's probe):
    - 1 card, Good then Again 2 days later → `NotEnoughData` (the crate's defaults);
    - 7 cards with 2 reviews each → `NotEnoughData` (below 8 items);
    - 20 cards with 3 reviews each → `NotEnoughData` (initial stabilities only).
    The forgetful history still gives `Improved` (`improved_weights_validate_and_score_better_than_current`); that is
    the other side of the rule.
  - ALGORITHMS.md §Optimization, line 130: Not enough reviews means the cards do not yet have enough reviews to fit
    weights from.
    Add that with only a few reviews of cards seen on more than one day, it reports Not enough reviews rather than
    offering weights it could not fit.
    Line 118's wording is item 8's.
  - The dialog copy stays: "Not enough reviews yet. Weights are learned from cards reviewed again on a later day."
  Constraints: `domain/optimizer.rs`, its test, and ALGORITHMS.md.
  Done when:
  - `RS --test domain optimiz` passes;
  - each new row fails without the check;
  - `bun run check:markdown` passes.
  Manual verify (desktop):
  - A new preset → a new deck on it → add 3 cards, study them today and again on a later day.
  - The preset → Optimize → "Not enough reviews yet." shows, with no Apply.
  - Skip if: no two study days can be arranged; the table above pins the same histories.
  Commit: Report untrained optimizer results as not enough reviews
  Depends on: 2

- [ ] 4. Cap w17 and w18 as the scheduler does before scoring
  Goal (A5):
  - New `pub fn` in `domain/optimizer.rs`: cap w17 and w18 at ts-fsrs `clipParameters`' ceiling for a relearning-step
    count.
    Above one step, the ceiling is `clamp(round8(v), 0.01, 2)` with `v = -(ln w11 + ln(2^w13 - 1) + 0.3·w14) / n`;
    otherwise it is 2.
    Compute in `f64`, as ts-fsrs does.
    INVARIANT naming its twin: ts-fsrs 5.2.3 `clipParameters`, which the scheduler applies on every load.
  - `optimize`: cap the trained weights before `format_weights`, so the stored weights are capped.
    Score `cap(parse(stored))` for the current and the found weights, which is what ts-fsrs schedules with.
    Rounding to four decimals can lift a capped value by under 0.00005; the scheduler caps it again.
  - Tests:
    - Rust (`optimizer_tests.rs`): two relearning steps cap the defaults' w17 and w18 at 0.36055143 (f32 tolerance);
      one step leaves them.
      The test cites `ts-fsrs/dist/index.mjs:540-552`.
    - Rust: the forgetful history with two relearning steps returns found weights whose w17 and w18 sit at or under
      the ceiling computed from their own w11, w13, and w14.
    - TS twin (`libs/srs/src/lib/algorithms-fsrs.test.ts`): `createFSRSAlgorithm` with two relearning steps and the
      default weights schedules with w17 = 0.36055143; one step keeps 0.5425.
      It pins the scheduler's side, so a ts-fsrs change to the cap fails a test.
  - FSRS-OPTIMIZER.md §Ruling: the optimizer caps w17 and w18 the way ts-fsrs does for the algorithm's relearning
    count, before it scores and stores them.
    §Applies when: a change to how ts-fsrs caps weights, beside the elapsed-day count.
    The module doc (`domain/optimizer.rs:3-4`) names the three points of agreement.
  Constraints: `domain/optimizer.rs`, both tests, and FSRS-OPTIMIZER.md (`agents/DECISIONS.md`: living document).
  Done when:
  - `RS --test domain optimiz` and `SRS algorithms-fsrs` pass;
  - the Rust pin fails with the crate's `sqrt` ceiling;
  - `bun run check:markdown` passes.
  Manual verify: none — the dialog looks the same; the scores change only with two or more relearning steps, which
  the tests pin.
  Commit: Cap w17 and w18 as the scheduler does before scoring
  Depends on: 3

- [ ] 5. Pin ts-fsrs and test its UTC day count
  Goal (A7; question 3):
  - `package.json:72`: `"ts-fsrs": "5.2.3"`.
    Run `bun install` so `bun.lock` records the exact specifier.
    The cache holds 5.2.3; if the install cannot run offline, stop and report.
  - `libs/srs/src/lib/algorithms-fsrs.test.ts`: grade a new card at 23:55 UTC and again at 00:05 UTC the next day;
    ts-fsrs counts one elapsed day.
    Two grades on one UTC date count zero.
    Read the count through a public ts-fsrs API; if only a deprecated field exposes it, use it with a WHY.
    Name the Rust twin (`gap_across_utc_midnight_counts_one_day_even_minutes_apart`, `optimizer_training_tests.rs:25`)
    and point back from it.
  - FSRS-OPTIMIZER.md §Ruling, the crate-pin bullet: ts-fsrs is pinned exactly too.
    A bump of either can change the day count or the cap.
  Constraints: `package.json`, `bun.lock`, the two tests, and FSRS-OPTIMIZER.md.
  Done when:
  - `SRS algorithms-fsrs` and `RS --test domain optimizer_training` pass;
  - `bun install --frozen-lockfile` passes;
  - `bun run check:markdown` passes.
  Manual verify: none — a test and a pin.
  Commit: Pin ts-fsrs and test its UTC day count
  Depends on: 4

- [ ] 6. Name algorithm fields alike in Russian labels and errors
  Goal (A12; question 4):
  - `libs/srs-react/locales/ru/messages.po:145`: the retention label "Коэфициент" becomes "Удержание", like its
    error (`libs/app/locales/ru/messages.po:482`).
  - `libs/app/locales/ru/messages.po:462`, `:466`, `:474`, `:478`: the step errors use the labels' terms.
    For example: "Длительность интервала заучивания должна быть больше нуля", "Недопустимая единица интервала
    переучивания".
  - No message id changes, so no extract; compile both apps per `agents/I18N.md`.
    Keep only these entries' catalog changes.
  Constraints: the two `ru` catalogs and the compiled app catalogs.
  Done when:
  - both compiles pass and `bun run typecheck` passes;
  - `rg -n 'Коэфициент|шага (пере)?обучения' libs/*/locales` finds nothing.
  Manual verify (web):
  - Settings → Language → Русский → Presets → a preset → the retention slider reads "Удержание".
  Commit: Name algorithm fields alike in Russian labels and errors
  Depends on: none

- [ ] 7. Take only whole numbers for step amounts and the maximum interval
  Goal (A1):
  - Fields: both step-amount fields (`algorithm-learning-steps.tsx:23-33`) and the maximum interval
    (`algorithm.tsx:143-147`) pass `formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }}`.
    `NumberField` spreads props after its own `formatOptions` (`number-field.tsx:19`), so keep `useGrouping: false`.
    One constant in `libs/srs-react/src/lib/algorithms/` serves both files.
  - Schema (`algorithms-fsrs.ts:31-44`): drop `.int()` from the step amount and from `maximumInterval`.
    The `superRefine` checks `!Number.isInteger(…)` beside each `<= 0` (`:58`, `:76`, `:92`), as retention does
    (`:48`), so a fraction gets its field's code.
    Rewrite the two WHY comments: Rust still stores `i64`, so on desktop a fraction fails serde before `validate()`.
  - Copy: the three codes say whole number in `en` and `ru` (`libs/app/locales/*/messages.po`):
    `validation.algorithm.fsrs.learning-steps.amount`, `…relearning-steps.amount`, `…maximum-interval`.
    For example: "Learning step amount must be a whole number greater than zero"; "Длительность интервала заучивания
    должна быть целым числом больше нуля" (item 6's terms).
    Compile both apps.
  - ALGORITHMS.md §Parameters: line 49 says a whole number of days, at least one; line 53 says the amount is a whole
    number, at least one.
  - Tests (`algorithms-fsrs.test.ts`): "rejects non-integer learning step amounts" (`:355`) and "rejects fractional
    maximumInterval" (`:387`) move into the code table (`:217-337`).
    Rows: `[1.5, "m"]` as a learning step, `[2.5, "m"]` as a relearning step, `maximumInterval: 10.5`; each asserts its
    field's code.
    Rust twin: a fractional step amount and maximum interval fail deserialization (`algorithms_serde_tests.rs`); add
    the case if it is missing.
  Constraints: the two field files, `algorithms-fsrs.ts`, the catalogs, ALGORITHMS.md, and the tests.
  Done when:
  - `SRS algorithms-fsrs`, `RS --test domain algorithms`, and `bun run typecheck` pass;
  - the three new rows fail with `.int()` back;
  - `bun run check:markdown` passes.
  Manual verify (web):
  - Presets → a preset → type "1.5" in the first learning step amount → the "." is not accepted.
  - Type "2" → Save → reload the page → the step shows 2.
  - The same for the maximum interval.
  Commit: Take only whole numbers for step amounts and the maximum interval
  Depends on: 6

- [ ] 8. Keep one home per algorithm rule in ALGORITHMS.md
  Goal (A4), in ALGORITHMS.md:
  - §Parameters keeps the six parameters: drop the Title bullet (line 43).
    The title rule lives in §Adding Algorithms (lines 73-76).
  - The later-grades rule lives in §What it is (lines 18-19).
    §Editing Algorithms (lines 103-104) drops its copy or points there.
    §Optimization's "see §Editing Algorithms" (line 144) points at §What it is.
  - The last-algorithm rule lives in §Deleting Algorithms (line 161); §Relationships drops line 37.
  - Scope: one statement of what is out (lines 7 and 9-10).
  - §Optimization line 118: say which reviews it learns from — every review of a card whose history the app holds
    from its first grade — instead of "every review".
  Constraints:
  - ALGORITHMS.md only, with no change in meaning.
  - Items 3 and 7 edit other lines of this file; keep their text.
  - DECKS.md's pointer to §What it is must still hold.
  Done when:
  - `bun run check:markdown` passes;
  - every `§` pointer to this file names an existing heading (`rg -n 'ALGORITHMS.md \(§' docs agents`).
  Manual verify: none — spec only.
  Commit: Keep one home per algorithm rule in ALGORITHMS.md
  Depends on: 3, 7

- [ ] 9. Test algorithm rows, validation codes, and optimize dialog edges
  Goal (A9):
  - `libs/db-sqlite/src/lib/algorithms.integration.test.ts`:
    - replace "updates algorithm title and content" (`:187-207`) with a full-field roundtrip.
      Change title, notes, and every content field (retention, weights, fuzz, both step lists, maximum interval), and
      compare the whole row.
      Then clear the notes and check they read back absent.
      Twin of `update_algorithm_round_trips_every_field` (`algorithms_integration_tests.rs:15`).
    - successor: a referenced algorithm deleted with no `successorId` fails with
      `not-found.algorithms.delete.successor`.
      That case and the missing-id case (`:146-156`) check that the deck still points at the algorithm.
  - `crates/koloda/tests/domain/algorithms_fsrs_tests.rs`: one table of invalid payloads that asserts each code,
    replacing the per-cell `is_err()` tests, as `reviews_validation_tests.rs` does.
    Write the table and delete the tests it replaces in this commit (`agents/TESTING.md` §Repetition and tables).
  - Retention at the limit and one past, on both sides: 70 and 99 accepted; 69 and 100 rejected with
    `validation.algorithm.fsrs.retention`.
  - `optimize-algorithm.test.tsx`, with gated promises:
    - apply rejects with `algorithms.optimizer.stale` → the refusal shows with Try again; Try again starts a new run;
    - open, close before the run resolves, reopen; then resolve the first run as improved → the dialog still shows the
      second run as running.
    The file mocks `@koloda/core-react`; `srs-react` keeps isolation for that (`agents/TESTING.md` §Runner
    constraints).
  Constraints: tests only; no product code changes.
  Done when:
  - `DB algorithms`, `RS algorithm`, `SRS algorithms-fsrs`, and `SR optimize-algorithm` pass;
  - each new case fails on its plausible bug: a dropped column, a swapped code, a bound at 69 or 100, a missing
    `runRef` check.
  Manual verify: none — tests only.
  Commit: Test algorithm rows, validation codes, and optimize dialog edges
  Depends on: 2, 7

- [ ] 10. Test the optimizer host's queued cancel and cleanup
  Goal (A8, the addon):
  - `OptimizerHost::run` (`apps/electron/src-rust/src/optimizer.rs:52-84`): take progress as a plain callback of
    `(current, total)`, so a Rust test can run it without a JS environment.
    `lib.rs:362-375` passes a closure that builds `{ requestId, current, total }` and calls the `ThreadsafeFunction`,
    so the wire stays the same.
  - `#[cfg(test)] mod tests` in `optimizer.rs`, on `Database::in_memory()` with one algorithm and no reviews:
    - register two runs, cancel the second, then run it: `Cancelled` (needs item 1);
    - after a run ends its entry is gone, and a later `cancel` for it does nothing;
    - a cancel for an unknown id does nothing.
    These pin the host's side of the INVARIANT: a cancel that arrives before the run starts is honored.
  Constraints: the addon's `optimizer.rs` and its `lib.rs` call site; no wire change.
  Done when:
  - `ADDON` passes;
  - the first case fails if `register` moves into `run`.
  Manual verify: none — no behavior change.
  Commit: Test the optimizer host's queued cancel and cleanup
  Depends on: 1

- [ ] 11. Optimize a preset in a desktop e2e flow
  Goal (A8, end to end):
  - New `apps/electron-e2e/src/algorithm-optimize.spec.ts`: Presets → a seeded preset (a fresh database has no
    reviews) → Optimize.
    "Not enough reviews yet." shows, Apply does not, and Close closes the dialog.
    It crosses IPC, NAPI, the optimizer thread, and the result.
  - No web twin: the web app offers no optimization (ALGORITHMS.md §Optimization).
    `apps/electron-e2e/README.md` (line 15) names it with sync as a desktop-only spec.
  Constraints:
  - Do not run either suite (`agents/VERIFY.md`).
  - Shared steps go in `libs/e2e` only if its README says so.
  Done when: `nx run electron-e2e:typecheck` passes.
  Manual verify: the human runs `algorithm-optimize` on desktop.
  Commit: Optimize a preset in a desktop e2e flow
  Depends on: none

- [ ] 12. Check preset flows by outcome in both e2e suites
  Goal (A10), on both hosts, step for step:
  - `algorithm-reset.spec.ts:58`: fill a maximum interval other than the default 36500, so Discard's check (`:76`)
    can fail.
  - `algorithm-edit.spec.ts`: also change notes, the first learning step, and the weights; save, leave, and reopen;
    each shows.
    Save invalid weights (for example "1, 2"): the weights error shows, and after Discard the saved weights are
    unchanged (§Parameters line 60).
  - `algorithm-delete.spec.ts:9-49`: after the successor delete, open the deck's Details; its preset is the successor.
  - `algorithm-delete.spec.ts:64-85`: rename it to what it proves.
    An unused preset deletes on confirm, with no successor picker (§Deleting Algorithms).
    Drop its final "Simple" check; the learning-default test covers it.
  - `algorithm-add.spec.ts:13-22`: the empty-title step asserts "Title can't be empty".
  Constraints:
  - Do not run either suite (`agents/VERIFY.md`).
  - Shared steps go in `libs/e2e` only if its README says so.
  Done when: `nx run web-e2e:typecheck` and `nx run electron-e2e:typecheck` pass.
  Manual verify: the human runs `algorithm-add`, `algorithm-edit`, `algorithm-delete`, and `algorithm-reset` on both
  hosts.
  Commit: Check preset flows by outcome in both e2e suites
  Depends on: none

- [ ] 13. List the step units once and share the progress-bar track
  Goal (A11: the unit lists, the progress bar):
  - `algorithms-fsrs.ts:8-22`: derive one unit list from the other, so the four ids are written once.
    Keep the `as const` tuple type that the validator's `includes` narrows with (`:65`, `:83`).
  - The progress-bar track class (`learned-today.tsx:90`, `optimize-algorithm.tsx:155`) becomes one constant in
    `libs/srs-react/src/lib/components/`, imported by both (`agents/CSS.md` §Static className).
  Constraints: no visible change.
  Done when: `SRS`, `SR`, and `bun run typecheck` pass.
  Manual verify (web):
  - Dashboard → the Learned today bars look as before.
  - Presets → a preset → the learning step unit picker lists seconds, minutes, hours, and days.
  Commit: List the step units once and share the progress-bar track
  Depends on: 2

## Outcome

<what shipped>
