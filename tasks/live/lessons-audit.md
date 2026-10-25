# Lessons audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, docs/specs/LESSONS.md, docs/specs/CARDS.md, docs/specs/LEARNING-SETTINGS.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/VERIFY.md, agents/CSS.md, agents/I18N.md, agents/RUST.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, agents/BACKWARDS-COMPATIBILITY.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/MARKDOWN.md, apps/web-e2e/README.md, apps/electron-e2e/README.md, libs/e2e/README.md, agents/REVIEW.md
Flow: local

## Intent

Settle every finding of the lessons audit, plus the two cards-audit findings that change lesson code, as one task.

- The lessons audit covered the behavior owned by `docs/specs/LESSONS.md`.
  That is the Dashboard overview and today's progress, starting a lesson, init and default amounts, studying, field
  operations, grading, learn-ahead, progress, persisting results, completion, early termination, and lesson hotkeys.
  Its report was `tmp/audits/lessons.md`.
- The cards audit (`tmp/audits/cards.md`) covered `docs/specs/CARDS.md`.
  Its finding 1 changes which template a lesson uses, and its finding 18 shares the lesson's card-content build with
  preview.
  Both are here; the rest of that report is triaged separately.
- The algorithms audit (`tmp/audits/algorithms.md`) finding 2 is what lessons finding 1 does to algorithm edits.
  It closes with lessons finding 1.

All three audits read `d32fb02e` (`main`).
Git ignores the reports.
This file restates every finding and its evidence, so neither the next session nor the archive reader needs them.

Triage checked each finding again at `aeb9282b`, where this task branches.
None of the files the findings cite changed in between.
`git diff --stat d32fb02e..aeb9282b` over them lists only AI edits in both hosts' `queries.ts`, `data-ipc.ts`, and
`libs/core-react` `queries.ts`, none on a lesson line.
So every finding holds, and every line number below is the same at both commits.
Triage read the cited lines and did not run tests.
It added entry L19 and extended L4 (Scope).

The lessons report's verdict: the domain and persistence layers are in good shape.
The two hosts agree statement for statement on the count and study-order SQL, the empty-match `null`/`None`, the
negative-amount code, and the one-transaction submit.
`IPC.md` §Data Commands matches the handlers.
The defects sit where React Query meets the reducer, and in the keyboard path.
The cards report's verdict on finding 1: CARDS.md and LESSONS.md contradict each other, and the lesson code follows
LESSONS.md, so a deck's template change blanks its older cards in lessons.

Done when, in user-visible terms:

- reopening a lesson with the same deck and amounts loads fresh cards, so grading never writes over newer progress;
- after cards are added or deleted, a deck's lesson init shows the counts its Dashboard badge shows;
- after a deck's template changes, its older cards study with their own template, not blank fields;
- the grade keys do nothing before the card is submitted, or while the close confirmation is open;
- a markdown field set to "type" stays hidden until submit, and focus lands on the first text type field or Continue;
- an unrevealed answer cannot be read by a screen reader, selected, or found with find-in-page;
- the grade intervals are Russian in the Russian interface;
- clearing an amount field counts as 0, so Start still works;
- a fresh install offers learning cards in Learn and Total lessons;
- the Dashboard counts show a card within about a minute of it coming due;
- LESSONS.md, CARDS.md, and LEARNING-SETTINGS.md match the code;
- `bun run check:push` passes on the tip, and every plan item is one commit with a `Task:` trailer.

## Scope

Entries use the report's numbers with a prefix: `L` for lessons, `C` for cards, `A` for algorithms.
L19 was found at triage.
Line numbers are at `aeb9282b`.

### Lessons

- L1. Spec violation, Must-fix: a reopened lesson studies the previous session's card snapshot.
  Decision: fixed by item 2 (`gcTime: 0`).
  - LESSONS.md (§Studying, line 171): "When the user starts the lesson, cards are loaded for the chosen amounts and
    filters."
  - The card load is a cached query keyed by amounts and filters
    (`libs/srs-react/src/lib/lessons/use-lesson-session.ts:64-76`; key `libs/core-react/src/lib/query-keys.ts:47`).
    It runs with the app's 60-second `staleTime` (`libs/app-react/src/lib/app-providers.tsx:62`) and TanStack's
    default five-minute `gcTime`.
  - The session takes the first successful result, cached or not (`use-lesson-session.ts:116-119`).
    The reducer keeps it and ignores any refetch (`lesson-reducer.ts:262-263`).
  - Nothing local invalidates `["lesson_data"]`.
    `rg 'lesson_data|lessons\.data' libs apps` (excluding `dist/`) finds the key, the two host queries, tests, and
    desktop sync (`apps/electron-react/src/app/sync-events.ts:8`, `:16`).
    The close path refreshes counts, totals, and cards, not this key (`use-lesson-close.ts:26-32`).
  - Both hosts persist the client-computed result as is (`libs/db-sqlite/src/lib/lessons.ts:208-226`,
    `crates/koloda/src/repo/lessons.rs:333-353`), by design (`docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`
    §Split source of truth).
    So a stale input overwrites newer progress.
  - Audit probe: two due learning cards; a Learn lesson; one card graded Again; closed and opened again.
    The second open defaulted to the same amounts, `{learn: 2}`.
    `getLessonData` ran once across both sessions.
    The second session held the card with `reps: 1` while the database had `reps: 2`.
  - Scenario: a learning card graded Again comes due a minute later; the user opens the same Learn lesson.
    Grading writes reps, lapses, stability, step, and last review computed from the state before the first grade.
    The new review records that old state.
    Card text or layout edited in between also shows stale.
  - Fix shape chosen at triage: `gcTime: 0` on the lesson-data query, not removing `["lesson_data"]` in
    `useLessonClose`.
    The badge's close path (`lessonAtom` written `null`, `lesson-actions.ts:70-83`) resets state without
    `useLessonClose`, so a removal there would miss it.
- L2. Spec violation, Must-fix: after a card change, a deck lesson initializes from stale counts.
  Decision: fixed by item 3.
  - LESSONS.md (§Init, line 135) shows "how many cards of that type are available".
    §Default Amounts (line 147): "Defaults are computed once available counts and today's review totals are loaded."
  - The lesson reads counts through `getLessonsQuery(filters)` (`use-lesson-session.ts:53-61`).
    That per-filter key has an observer only while the dialog is open.
  - Card mutations invalidate `queryKeys.lessons.all()`, which prefix-matches every filtered key
    (for example `libs/srs-react/src/lib/cards/add-card.tsx:51`).
    With no observer, the deck-scoped query is only marked stale.
  - On the next open, TanStack returns the stale data at once while it refetches.
    `initialize` fires on that first value (`use-lesson-session.ts:104-114`), and the reducer ignores the fresh one
    (`lesson-reducer.ts:171`).
  - The close-time invalidation covers only the lesson's own grades; its observer is still enabled then, so it
    refetches (`use-lesson-close.ts:27`).
  - Audit probe: a deck with 3 new cards, all studied, the lesson closed, 5 cards added, New opened on that deck.
    Init showed 0 available and amounts of 0, with Start disabled; the database and the Dashboard badge had 5.
  - Scenario: the user studies a deck, adds cards (by hand or through the assistant), and reopens its lesson within
    about five minutes.
    With an old count of 0 the lesson cannot start until reopened; after deletions, init offers more than exist.
- L3. Spec violation, Should-fix: the grade hotkeys grade a card the user has not revealed.
  Decision: fixed by item 4.
  - LESSONS.md (§Hotkeys, line 94): "The 'Again', 'Hard', 'Good', and 'Easy' hotkeys grade the submitted card."
  - `lesson-studying.tsx:24-27` registers the grade keys in the "grades" scope with no submitted check.
    `gradeSelected` checks only the phase and the content (`lesson-reducer.ts:368-391`).
  - The default keys are `1`–`4` (`libs/app/src/lib/settings-hotkeys.ts`, `DEFAULT_HOTKEYS_SETTINGS.grades`).
    They are skipped in text fields, but a focused "Continue" button is not an input to the hotkey manager.
  - Audit probe: on an unsubmitted card, `gradeSelected` queued a result and advanced.
  - The reducer tests grade without submitting (`lesson-reducer.test.ts:395-403`, `:458-459`), which locks it in.
  - Scenario: a reveal-only card shows "Continue" focused; pressing `3` grades it Good and saves the review unseen.
- L4. Spec violation, Should-fix: the grade hotkeys act behind the termination confirmation.
  Decision: fixed by item 4, with the triage extension below.
  - LESSONS.md (§Early Termination, line 298): "'Continue studying' dismisses the confirmation and leaves the current
    card as it was."
  - The confirmation is an overlay with a focus scope (`lesson-termination.tsx:22-37`).
    The grade keys stay enabled (`lesson-studying.tsx:24-27`), and the reducer does not check
    `isTerminationRequested` (`lesson-reducer.ts:368-391`).
  - Audit probe: a submitted card with the confirmation open; `gradeSelected` moved from card 0 to card 1 while the
    flag stayed set.
  - On the last card, `moveToNextCard` finishes the lesson without clearing the flag (`lesson-reducer.ts:347-350`).
    The footer's dimming overlay renders on the flag alone (`lesson-footer.tsx:81-83`), so it stays over "Close".
  - Triage extension: the grade guard closes that path, but an empty card load reaches it too.
    Escape while cards load opens the confirmation (`lesson.tsx:49-54` mounts `LessonStudying` and
    `LessonTermination` in loading cards).
    An empty load then finishes through `moveToNextCard` with the flag set, and the dimming stays over "Close".
    Read from the code, not probed; item 4's reducer case pins it.
- L5. Spec violation, Should-fix: a markdown "type" item takes the focus target and shows before submit.
  Decision: fixed by item 7; a markdown "type" item is hidden until submit, like reveal (question 3).
  - LESSONS.md (§Field Operations, line 198): "The first type field in the layout is focused automatically."
    §Submitting a Card (line 224): "If there is no type field to focus, 'Continue' is focused when the card appears."
    Line 207 says markdown fields "do not present a typing input" and nothing about a markdown "type" item.
  - TEMPLATES.md §Layout and `libs/srs/src/lib/templates.ts:35-42` let any field take any operation.
  - `firstInputFieldId` is the first "type" item of any field type (`lesson-reducer.ts:335`).
    Only a text field with that id autofocuses (`lesson-card-field-text.tsx:31`).
    The footer focuses "Continue" only when no id is set (`lesson-footer.tsx:37-41`).
  - The "type" variant has no hiding class (`lesson-card-field.tsx:10-14`), so a markdown "type" field shows its value
    before submit.
  - Audit probe: with a markdown "type" item before a text "type" item, `firstInputFieldId` was the markdown field.
  - Scenario: nothing is focused when the card appears, and the markdown answer is visible before submit.
- L6. Spec gap, Later: LESSONS.md does not describe a failed prepare.
  Decision: fixed by item 18.
  - §Completion (lines 285-287) covers card data failing after Start; §Phases (preparing) names no failure.
  - A rejected counts, totals, or settings query finishes the lesson with the load error and "Close"
    (`lesson-reducer.ts:291-295`, `use-lesson-session.ts:78-102`); tests pin that.
- L7. Spec hygiene, Later: LESSONS.md restates the close-key rule in six places.
  Decision: fixed by item 18.
  - `agents/FUNCTIONAL-SPECIFICATIONS.md` (One home per rule).
  - "Escape and 'Close popover' have the same effect, which depends on the phase" appears in §Starting a Lesson
    (line 77), §Hotkeys (lines 91, 99), §Phases (line 121 and the list after it), §Init (line 143), §Completion
    (line 290), and §Early Termination (lines 295-302, which repeat the §Phases list).
  - "Enter without modifiers in a type field submits" appears in §Hotkeys (line 102), §Field Operations (line 199),
    and §Submitting a Card (line 217).
  - "Grade hotkeys fire on key release" appears in §Hotkeys (line 95) and §Grading (line 239).
- L8. Risk, Should-fix: the grade button intervals are always English.
  Decision: fixed by item 9.
  - `lesson-card-grades.tsx:21` renders `formatDistanceStrict(card.due, log.review)` with no locale (import `:4`).
    The Russian interface shows "10 minutes".
  - `libs/app/src/lib/timestamp-format.ts:24-26` already maps the interface language to a date-fns locale, privately.
  - `rg 'formatDistance|date-fns/locale' libs apps` finds no other relative-time call.
- L9. Risk, Later: a cleared amount field turns Total into `NaN`.
  Decision: fixed by item 10.
  - react-aria's NumberField commits an empty field as `NaN`
    (`node_modules/react-stately/dist/private/numberfield/useNumberFieldState.mjs:85-87`).
  - `lesson-init-amount-input.tsx:36-38` forwards it, and `amountUpdated` sums with `Number()`
    (`lesson-reducer.ts:245-251`).
    Total becomes `NaN` and "Start" is disabled (`lesson-footer.tsx:51`), even when another type has cards.
- L10. Risk, Later: an unrevealed answer is only transparent.
  Decision: fixed by item 8.
  - LESSONS.md (§Field Operations, line 193): a reveal field "is hidden until the card is submitted".
  - A reveal field gets `opacity-0` until submit (`lesson-card-field.tsx:12`), with no `aria-hidden` or `inert`
    (`:39`).
    A screen reader reads the answer, and select-all highlights it.
- L11. Improvement, Should-fix: no test presses a lesson hotkey.
  Decision: fixed by item 15 (e2e) and item 4 (reducer guards).
  - Untested at every layer: grade keys on key release (`lesson-studying.tsx:24-27`), Enter/Space submit (`:28`),
    the Submit hotkey (`:30-37`, `lesson-init.tsx:20-27`), Escape per phase (`lesson-init.tsx:18`,
    `lesson-studying.tsx:29`, `lesson-completion.tsx:15`), and "Close popover" through the modal
    (`libs/ui/src/lib/primitives/overlay/dialog.tsx:51`).
  - `rg -n 'keyboard\.press' apps/web-e2e/src apps/electron-e2e/src libs/e2e/src` finds, for lessons, only Escape in
    `lesson-controls.spec.ts` (web `:78`, `:98`; desktop `:79`, `:99`).
  - `rg -ln 'useAppHotkey|keyboard|fireEvent.key' libs/srs-react/src --glob '*.test.*'` finds only
    `optimize-algorithm.test.tsx`.
  - `hotkeys.md` finding 10 left this gap to this entry; the "e2e suites" concern audit should not re-raise it.
- L12. Improvement, Should-fix: the web host has no twin for study order or relearning.
  Decision: fixed by item 11.
  - `agents/TESTING.md` (The TS ↔ Rust twin rule); LESSONS.md §Studying sets the order.
  - Rust pins the draw order (new oldest first, then learn and review soonest due), the due cut-off, and the deck
    filter (`crates/koloda/tests/integration/lessons_integration_tests.rs:262`).
    It also counts state 3 as learn (`:405`).
  - The web test of the same query asserts only the count and the related entities
    (`libs/db-sqlite/src/lib/lessons.integration.test.ts:119-175`).
    No web lesson test uses a relearning card (`rg 'state: 3|FSRS_RELEARNING'` in that file: no hit).
- L13. Improvement, Should-fix: the reducer tests lock in grading an unrevealed card and skip the learn-ahead cutoff.
  Decision: fixed by items 4 (submit before grading) and 5 (cutoff table on the real helpers).
  - Both grading tests grade without `cardSubmitted` (`lesson-reducer.test.ts:395-403`, `:458-459`).
  - The file mocks `getCardGrades`, `createCardFromCardFSRS`, and `createReviewFromReviewFSRS` (`:15-30`).
    The learn-ahead test has the mock return the appended card (`:383-384`), then asserts it is next.
    It would pass if the real helpers dropped the card's deck.
  - No test covers §Learn Ahead's boundary (line 249): due at the cutoff, one past it, and unset.
    `agents/TESTING.md` (Threshold rules) asks for the limit and one past it; e2e covers only a limit of 0.
  - The audit probe showed the real `@koloda/srs` helpers work in the reducer under fake timers.
- L14. Improvement, Later: the store tests re-test reducer cases.
  Decision: fixed by item 13.
  - `agents/TESTING.md` (One home per behavior; Banned patterns: getter round-trips).
  - In `lesson-store.test.ts`, four cases repeat reducer cases: `:97`, `:109`, `:119`, `:146`.
    `:171` ("exposes the expected slices after initialize") is a selector inventory.
  - The `lessonAtom` launch cases (`:73`, `:84`) and the identity case (`:135`) own store-level routing and stay.
- L15. Improvement, Later: missing twin and error-path tests.
  Decision: fixed by items 11 (rollback twin, with L19) and 12 (uploader error).
  - Rust tests the submit rollback (`lessons_integration_tests.rs:128-186`); web tests only validation before its
    transaction (`lessons.integration.test.ts:273`).
  - The uploader test never settles an error, so the `onError` → `"error"` mapping (`lesson-uploader.tsx:23-25`) has
    no test.
- L16. Improvement, Later: leftover surface in the web lesson repo.
  Decision: fixed by item 14.
  - `getLessonData` ends with `lessonDecks && lessonTemplates && lessonAlgorithms ? … : null`
    (`libs/db-sqlite/src/lib/lessons.ts:187-194`); all three are arrays, so the `null` branch is dead.
  - `submitLessonResult` re-reads the inserted review to return it (`:249-250`).
    Its only reader is `lessons.integration.test.ts:255` (`rg 'submitLessonResult' libs apps`); the uploader ignores
    it.
    Desktop returns nothing, and `Queries` widens the type to `Review | undefined`
    (`libs/core-react/src/lib/queries.ts:100`).
- L17. Product decision, Later: the default Learn cap of 0 opens every Learn lesson at 0 cards.
  Decision: fixed by item 16; the default becomes unlimited, still not counting toward Total (question 4).
  - The default Learn limit is a hard 0 that does not count toward Total on both hosts
    (`libs/app/src/lib/settings-learning.ts:126`, `crates/koloda/src/domain/settings_learning.rs:206-211`, `:304-309`).
  - `tasks/archive/unlimited-daily-limits.md` (Open questions) kept it on purpose: "Default Learn `0`? — keep as a
    hard zero that does not count toward Total".
  - Under LEARNING-SETTINGS.md §Daily Limits (zero is a hard cap) and LESSONS.md §Default Amounts, a fresh install
    opens the Learn badge at 0 with Start disabled.
    A Total lesson includes no learning cards unless the user raises the amount every time.
- L18. Product decision, Later: the Dashboard counts do not follow due times.
  Decision: fixed by item 17; the counts refetch every minute while the Dashboard is open (question 5).
  - LESSONS.md (§Core model, line 29): available counts are "cards of each type ready to study now".
  - The counts are read once, as of fetch time (`apps/web/src/app/queries.ts:172-175`,
    `apps/electron-react/src/app/queries.ts:168-171`; read by `libs/srs-react/src/lib/lessons/lessons.tsx:14`).
    They refresh only on invalidation, or on a remount after 60 seconds; `rg refetchInterval libs apps` has no hit.
  - A user waiting on the Dashboard for a learning step sees Learn stay at 0 until they navigate away and back.
- L19. Improvement, found at triage: the Rust rollback test never reaches its transaction.
  Decision: fixed by item 11.
  - `submit_lesson_result_rolls_back_when_review_insert_fails` (`lessons_integration_tests.rs:128-186`) sends a review
    whose `card_id` differs from the card's id, expecting a foreign key failure inside the transaction.
  - `submit_lesson_result` validates first (`crates/koloda/src/repo/lessons.rs:328`).
    `LessonResultData::validate` rejects mismatched ids with `validation.lessons.result.card-review-mismatch`
    (`crates/koloda/src/domain/lessons.rs:120-125`).
  - So the test passes on validation, and would pass with no transaction at all.
    A web twin copied from it would be just as empty.

### Cards and algorithms

- C1. Spec violation, Must-fix: a lesson renders a card with its deck's current template, not its own.
  Decision: fixed by item 1; a lesson uses the card's own template, and CARDS.md §Relationships is the one home
  (question 2).
  - CARDS.md (§Relationships, lines 28-30): "A card stores its own template.
    Changing the deck's current template does not rewrite existing cards.
    Table, edit, and preview resolve the template per card."
  - LESSONS.md (§Relationships, line 43): "Each card in the session uses its deck's template and algorithm."
    §Studying (line 182): "Each card is shown using its deck's template layout."
  - DECKS.md (§Details, lines 60, 76) lets the user change a deck's template, and points at CARDS.md for existing
    cards.
  - Both hosts load lesson templates by joining decks on the deck's current template: web
    `libs/db-sqlite/src/lib/lessons.ts:150-165` (called at `:184`), desktop `crates/koloda/src/repo/lessons.rs:213-252`
    (called at `:314`).
  - The reducer picks the template by `deck.templateId` (`libs/srs-react/src/lib/lessons/lesson-reducer.ts:322`).
    Each field reads `content.card.content[field.id]?.text || ""` (`lesson-card-field.tsx:33`), and field ids are
    UUIDs (`libs/srs/src/lib/templates.ts:28`), so another template's fields find nothing.
  - Preview follows CARDS.md and uses the card's template (`cards-table-cell-preview-card.tsx:25`), so preview and
    lesson disagree for the same card.
  - Audit probe (web): a deck on template T1 with one card, then switched to T2 with its own field ids.
    `getLessonData` returned only T2, and the lesson layout read `["", ""]`.
  - Scenario: after a template change, every older card shows empty fields, a "type" field compares the answer with
    an empty string, and the user grades a blank card.
  - `templates.md` finding 6 (new templates reuse the seed template's field ids) hides this symptom for templates added
    from the default.
    It is fixed after this task, in the templates triage.
- C18. Improvement, Later: preview copies the lesson's card-content build.
  Decision: fixed by item 6, before item 7 changes the shared rule.
  - `libs/srs-react/src/lib/cards/card-preview-reducer.ts:33-51` repeats `lesson-reducer.ts:328-338`: the display-only
    `canSubmit` rule and `firstInputFieldId`.
  - L5 changes `firstInputFieldId`; landing that in the lesson copy alone would drift preview from CARDS.md
    §Card Preview.
- A2. Spec violation, Should-fix: a reopened lesson grades with the parameters cached before a save or apply.
  Decision: fixed by item 2 (L1), with no code of its own.
  - ALGORITHMS.md (§Editing Algorithms, line 101): "Changing parameters affects future grading for decks that use this
    algorithm."
    §Optimization (line 142): applied weights "affect later grades like any other parameter change".
  - A lesson grades with the algorithm content inside its lesson-data snapshot (`lesson-reducer.ts:316`).
    Save and Apply invalidate only `algorithms.all()` (`algorithm.tsx:33-34`, `optimize-algorithm.tsx:83-84`).
    Desktop sync does refresh `["lesson_data"]` for the `algorithms` kind (`sync-events.ts:8`, `:17`), so a remote edit
    reached the next lesson and a local one did not.
  - Once the lesson-data entry is dropped when its session ends (item 2), the next lesson reads the saved parameters.

### Out

- The rest of `cards.md`, and `templates.md`, `decks.md`, `algorithms.md`, `media.md`, `learning-settings.md`,
  `interface-settings.md`, `hotkeys.md`, and `host-desync.md`.
  They are triaged separately; `tmp/audits/PROGRESS.md` holds their order.
- `cards.md` finding 9 (card delete and reset leave today's totals stale).
  Item 3 waits for fetches but cannot refresh a query nothing invalidates.
- `libs/srs-react/src/lib/cards/add-card.tsx:58-65` dropping its invalidation when the dialog unmounts.
  The assistant data access task handed it to the cards triage.
- `hotkeys.md` findings 1, 8, and 14 (hotkey scopes are flags).
  This task keeps the lesson's "grades" scope as it is.
- What `host-desync.md` lists from this report (L12, L15, L16) is fixed here; its triage should record that.

## Open questions

- [x] 1. Task shape: `lessons.md` alone, or with `cards.md`? —
  `lessons.md` with `cards.md` findings 1 and 18, closing `algorithms.md` finding 2 (human, 2026-10-25).
- [x] 2. C1: which template does a lesson use? — the card's own; CARDS.md §Relationships is the one home, and
  LESSONS.md points to it (human, 2026-10-25).
- [x] 3. L5: what does a markdown "type" item show before submit? — nothing; it is hidden until submit, like reveal.
  Autofocus goes to the first text "type" field, or to "Continue" (human, 2026-10-25).
- [x] 4. L17: keep the default Learn cap of 0? — no; fresh installs get an unlimited Learn limit that does not count
  toward Total.
  Stored settings keep their values (human, 2026-10-25).
- [x] 5. L18: should the Dashboard counts follow due times? — refetch them every 60 s while the Dashboard is open
  (human, 2026-10-25).
- [x] 6. Flow? — `local`, the default.
- [x] 7. Plan approved as written (human, 2026-10-25).

## Plan

`SR`, `DB`, and `APP` below stand for `bunx vitest run --config libs/<lib>/vitest.config.mjs --configLoader runner` with
`srs-react`, `db-sqlite`, and `app`.
`RS` stands for `cargo test -p koloda`.
Line numbers are at `aeb9282b`; when an earlier item moved them, find the code by its text.

- [x] 1. Study each card with its own template
  Goal (C1; question 2):
  - Web `getLessonTemplates` (`libs/db-sqlite/src/lib/lessons.ts:150-165`): take template ids, not deck ids.
    Select `FROM templates t WHERE t.id IN (…)` with no deck join.
    `getLessonData` (`:167-195`) passes the unique `templateId`s of the loaded cards.
  - Desktop `get_lesson_templates` (`crates/koloda/src/repo/lessons.rs:213-252`) and its call in `get_lesson_data`
    (`:314`): the same, from the cards' `template_id`.
    Update both twin comments to say the templates come from the cards.
  - Reducer `moveToNextCard` (`libs/srs-react/src/lib/lessons/lesson-reducer.ts:322`): find the template by
    `card.templateId`.
    The deck still supplies the algorithm (`:316`).
  - Specs:
    - CARDS.md §Relationships line 30: "Table, edit, preview, and lessons resolve the template per card."
    - LESSONS.md line 43: each card uses its own template (point to CARDS.md (§Relationships)) and its deck's
      algorithm.
    - LESSONS.md line 182: each card is shown using its own template's layout, with the same pointer.
  - Tests:
    - twin integration cases on both hosts, in `libs/db-sqlite/src/lib/lessons.integration.test.ts` and
      `crates/koloda/tests/integration/lessons_integration_tests.rs`;
    - in each, a card is added under template T1, then the deck switches to T2, whose field ids differ;
    - the lesson data's templates are T1, not T2;
    - a reducer case: a card whose `templateId` is not its deck's studies with its own template.
  Constraints:
  - Keep `LessonData` and its IPC shape; `templates` stays a list of `LessonTemplate`.
  - Keep the slim `id` + `content` projection on both hosts.
    Implemented without `DISTINCT`: with no join, the ids are unique primary keys.
  Done when:
  - `DB lessons`, `RS lesson`, and `SR lesson-reducer` pass;
  - the new web and Rust cases fail against the deck join.
  Manual verify (web; the desktop runs the same Rust SQL through its twin):
  - Add a deck on the seeded template with one card; study it once so it is known to work.
  - Add a template, delete its two default fields, add two new fields, and lay them out.
    Its fields then have new ids, so the bug shows; templates added unchanged share the seed ids
    (`templates.md` finding 6).
  - Switch the deck to the new template → open its lesson → the card shows its own front and back, not blanks.
  Commit: Study each card with its own template
  Depends on: none

- [x] 2. Load fresh card data each time a lesson starts
  Goal (L1; closes A2):
  - Lesson-data query (`libs/srs-react/src/lib/lessons/use-lesson-session.ts:64-76`): add `gcTime: 0`.
  - WHY above it: the session keeps the first successful result (`lesson-reducer.ts:262-263`), so a cached entry
    would replay an old snapshot.
    With `gcTime: 0` the entry goes as soon as its key loses its observer.
    That happens when close resets setup, which changes the key, on every close path, including the badge's.
  - Test in `use-lesson-session.test.tsx`: start a lesson, receive data, close, then reopen with the same request and
    amounts and start again.
    Expect `getLessonData` called twice, and the second session to hold the second result.
  Constraints:
  - Do not invalidate or remove `["lesson_data"]` elsewhere; desktop sync's entry stays.
  - No change to the reducer.
  Done when:
  - `SR use-lesson-session` passes;
  - the new case fails without `gcTime: 0`.
  Manual verify (web):
  - A deck with one new card → New badge → Start → Escape → Close, without grading.
  - Edit that card's front text in the deck's cards → back to the Dashboard → New badge → Start.
  - The card shows the edited text.
  Commit: Load fresh card data each time a lesson starts
  Depends on: none

- [x] 3. Wait for fresh counts before initializing a lesson
  Goal (L2):
  - Initialize effect (`use-lesson-session.ts:104-114`): return while `isFetchingLearningSettings`,
    `isFetchingLessons`, or `isFetchingTodayReviewTotals` is true, and add them to its dependencies.
  - WHY: a reopened dialog first gets the stale cached counts while they refetch, and the reducer keeps the first
    `initialize` (`lesson-reducer.ts:171`).
    The prepare-error effect (`:78-102`) already waits out fetches the same way.
  - Test in `use-lesson-session.test.tsx`: open a deck lesson and let it initialize, then close it.
    Change the host's counts, invalidate `queryKeys.lessons.all()`, and reopen.
    Gate the refetch so the stale value is served first, then release it.
    Expect `setup.available` to equal the new counts.
  Constraints: `use-lesson-session.ts` and its test only.
  Done when:
  - `SR use-lesson-session` passes;
  - the new case fails without the fetching guard.
  Manual verify (web):
  - A deck with 2 new cards → New badge → study both → Close.
  - Add 3 cards to that deck → back to the Dashboard → New badge on that deck.
  - Init shows 3 available, the New amount is 3, and Start is enabled.
  Commit: Wait for fresh counts before initializing a lesson
  Depends on: none

- [x] 4. Grade only a submitted card with no close confirmation open
  Goal (L3, L4, and the submit-first half of L13):
  - `gradeSelected` (`lesson-reducer.ts:368-391`): return while the card is not submitted
    (`content.form.isSubmitted` false) or `isTerminationRequested` is set.
  - `cardSubmitted` (`:353-356`): return while `isTerminationRequested` is set.
  - `moveToNextCard` (`:347-350`): clear `isTerminationRequested` when it finishes the lesson.
    That covers an empty card load while the confirmation is open (L4 triage extension).
  - Reducer cases in `lesson-reducer.test.ts`:
    - grading an unsubmitted card is a no-op (state identity);
    - grading and submitting while termination is requested are no-ops;
    - after the request is cancelled, the same card grades;
    - an empty card load while termination is requested finishes with the flag cleared.
  - Submit before grading in the existing grading cases (`:359`, `:444`).
  Constraints: the reducer and its test only; the hotkey registrations in `lesson-studying.tsx` stay.
    Implemented: `lesson-uploader.test.tsx`'s fixture graded without submitting, so it now submits first.
  Done when:
  - `SR lesson-reducer` passes;
  - each new case fails when its guard is removed.
  Manual verify (web):
  - A lesson whose card has a reveal field → press `3` before "Continue" → nothing happens.
  - Press "Continue" → press `3` → the lesson moves to the next card.
  - On a submitted card → Escape → press `3` → nothing; "Continue studying" → the same card, grades shown.
  Commit: Grade only a submitted card with no close confirmation open
  Depends on: none

- [x] 5. Test learn-ahead at its cutoff on the real grade helpers
  Goal (the rest of L13):
  - Drop the file-level `vi.mock("@koloda/srs")` and its hoisted mocks (`lesson-reducer.test.ts:15-30`, `:157-162`).
    Rewrite the grading cases on the real helpers under fake timers.
    Assert what the reducer decides: the chosen rating, the card id, the one-hour time cap, and which card is next.
    Do not assert FSRS numbers; `libs/srs` owns those.
  - Add a table for §Learn Ahead's boundary (LESSONS.md line 249), each row grading a learning card Again:
    - due exactly at the cutoff: not appended;
    - cutoff one minute past the due time: appended, keeping its deck and template;
    - learn-ahead unset: not appended.
    Derive the due time from the real `getCardGrades` result, not a literal.
    Leave out "no due time": every real grade has one, so the `!card.dueAt` guard (`lesson-reducer.ts:395`) cannot
    be reached this way.
  - `agents/TESTING.md` (§Runner constraints) names this file's `@koloda/srs` mock as the `srs-react` example.
    Replace it with a mock that is still there: `optimize-algorithm.test.tsx` file-mocks `@koloda/core-react`.
  Constraints: `lesson-reducer.test.ts` and that one TESTING.md bullet.
  Done when:
  - `SR` passes in full, which shows no sibling depended on the mock;
  - `grep -rn 'vi.mock("@koloda/srs"' libs/srs-react/src` finds nothing;
  - changing `<` to `<=` in `doesLearnAheadMatch` (`:400`) fails the at-cutoff row.
  Manual verify: none — tests only.
  Commit: Test learn-ahead at its cutoff on the real grade helpers
  Depends on: 4

- [x] 6. Share the lesson card form builder with preview
  Goal (C18):
  - Export one builder from `lesson-reducer.ts` that turns a `LessonTemplate` into the card form: the display-only
    `canSubmit` rule, `firstInputFieldId`, empty `data`, and `isSubmitted`.
    Today that is `:328-338`.
  - Call it from `moveToNextCard` and from `card-preview-reducer.ts` `setContent` (`:33-51`).
  - Keep the display-only WHY with the builder.
  Constraints: behavior unchanged; no new tests (the existing reducer cases cover the form, and item 7 adds cases).
  Done when: `SR lesson-reducer card-preview` passes, and `bun run typecheck` passes.
  Manual verify: none — refactor, behavior unchanged.
  Commit: Share the lesson card form builder with preview
  Depends on: 1

- [x] 7. Hide a markdown type field until submit and focus the first text one
  Goal (L5; question 3):
  - Builder (item 6): `firstInputFieldId` is the first "type" item whose field is a text field.
  - `lesson-card-field.tsx` (`:7-16`, `:39`): a "type" item on a non-text field is hidden until submit, the same way
    a reveal item is.
    Derive "hidden until submit" once from the operation and the field type, and use it for the variant.
  - LESSONS.md §Field Operations:
    - line 198: the first text type field is focused;
    - after line 207: a markdown field set to type is hidden until the card is submitted, like reveal.
    §Submitting a Card line 224 stays true as written.
  - Builder cases in `lesson-reducer.test.ts`:
    - a markdown type item before a text one: `firstInputFieldId` is the text field;
    - a markdown type item alone: no `firstInputFieldId`, so the footer focuses "Continue";
    - a markdown type item alone still allows a submit (`isSubmitted` starts false).
  Constraints:
  - `lesson-card-field.tsx`, the builder, its tests, and LESSONS.md.
  - Preview follows through item 6; do not edit `card-preview-reducer.ts`.
  Done when:
  - `SR lesson-reducer card-preview` passes;
  - the first builder case fails against the any-field rule.
  Manual verify (web):
  - A template with a markdown field set to "type", placed before a text field set to "type" → a deck on it with
    one card → its lesson.
  - The markdown value is hidden and the text field has focus; "Continue" → the markdown value appears.
  - The same card in the deck's card preview behaves the same way.
  Commit: Hide a markdown type field until submit and focus the first text one
  Depends on: 6

- [x] 8. Keep unrevealed answers out of reach until submit
  Goal (L10):
  - `lesson-card-field.tsx:39`: set `inert` on the field wrapper while it is hidden until submit.
    That is a reveal item, or item 7's non-text type item, on an unsubmitted card.
    `inert` drops it from the accessibility tree, selection, and find-in-page (React 19.2 supports the attribute).
  - Component cases for `LessonCardField`:
    - an unsubmitted reveal field is inert;
    - the same field after submit is not;
    - a display field never is.
  Constraints: `lesson-card-field.tsx` and its new test.
  Done when:
  - `SR lesson-card-field` passes;
  - the first case fails without `inert`.
  Manual verify (web):
  - A lesson card with a reveal field → before "Continue", select all and search the page for the answer text.
  - Nothing is highlighted and nothing is found.
  - After "Continue", the answer is selectable.
  Commit: Keep unrevealed answers out of reach until submit
  Depends on: 7

- [x] 9. Show grade intervals in the interface language
  Goal (L8):
  - Export the date-fns locale mapping (`dateFnsLocale`, `libs/app/src/lib/timestamp-format.ts:24-26`) from
    `libs/app/src/index.ts`.
  - `lesson-card-grades.tsx:21`: pass `{ locale: dateFnsLocale(lang) }`.
    Read `lang` from `langAtom` (`@koloda/core-react`), as `use-timestamp-formatter.ts:10` does.
  - A component case: with `langAtom` set to `ru`, a grade due 10 minutes after its review reads "10 минут".
  Constraints: no new catalog keys; date-fns supplies the words.
  Done when:
  - `SR lesson-card-grades` passes;
  - the case fails without the locale option.
  Manual verify (web):
  - Settings → Interface → Russian → a lesson → submit a card.
  - The intervals above the grade buttons are Russian ("1 минута", "10 минут").
  Commit: Show grade intervals in the interface language
  Depends on: none

- [x] 10. Treat a cleared lesson amount as zero
  Goal (L9):
  - `amountUpdated` (`lesson-reducer.ts:245-251`): store 0 when the value is not a number (`NaN`).
  - A reducer case: clearing New while Learn has 2 leaves New at 0 and Total at 2, and `setupSubmitted` still moves
    to loading cards.
  Constraints: the reducer and its test only.
  Done when:
  - `SR lesson-reducer` passes;
  - the case fails without the guard.
  Manual verify (web):
  - The Total badge with New and Review cards → init → clear the New field → Tab.
  - New shows 0, Total is the Review amount, and Start is enabled.
  Commit: Treat a cleared lesson amount as zero
  Depends on: none

- [x] 11. Add the web lesson twins and make the rollback tests reach the transaction
  Goal (L12, the twin half of L15, L19):
  - In `libs/db-sqlite/src/lib/lessons.integration.test.ts`, add twins of:
    - `get_lesson_cards_applies_limits_due_at_and_deck_filters` (`lessons_integration_tests.rs:262`): draw order,
      due cut-off, deck filter;
    - `get_lesson_cards_treats_state_three_as_learn` (`:405`).
  - Rust `submit_lesson_result_rolls_back_when_review_insert_fails` (`:128-186`):
    - give the review the card's own id, so validation passes;
    - force the review insert to fail inside the transaction, for example with a test-only
      `BEFORE INSERT ON reviews` trigger that raises;
    - assert the error is `db.update`, the card is unchanged, and no review exists.
  - Add the web twin of that test, failing the insert the same way.
  Constraints: tests only; no repo code changes.
  Done when:
  - `DB lessons` and `RS lesson` pass;
  - both rollback cases fail if the update and insert run outside one transaction.
  Manual verify: none — tests only.
  Commit: Add the web lesson twins and make the rollback tests reach the transaction
  Depends on: none

- [ ] 12. Test that a failed lesson upload is marked as an error
  Goal (the uploader half of L15):
  - `lesson-uploader.test.tsx`: the first submit rejects and the second resolves, through gated promises.
    Expect the first result logged `error`, no retry, and the second uploaded and logged `success`.
    LESSONS.md (§Persisting Results): a failed save is marked and not retried.
  Constraints: the test file only.
  Done when:
  - `SR lesson-uploader` passes;
  - the case fails if `onError` maps to `success` (`lesson-uploader.tsx:23-25`).
  Manual verify: none — tests only.
  Commit: Test that a failed lesson upload is marked as an error
  Depends on: none

- [ ] 13. Delete lesson store tests that repeat reducer cases
  Goal (L14):
  - In `lesson-store.test.ts`, delete `:97`, `:109`, `:119`, `:146` (reducer cases through the store) and `:171`
    (selector inventory).
  - Keep `:73`, `:84`, `:135`, and `:198`.
  Constraints: the test file only; drop helpers that become unused.
  Done when: `SR lesson-store` passes.
  Manual verify: none — tests only.
  Commit: Delete lesson store tests that repeat reducer cases
  Depends on: none

- [ ] 14. Drop the lesson repo's dead branch and unused review return
  Goal (L16):
  - `getLessonData` (`libs/db-sqlite/src/lib/lessons.ts:187-194`): return the data object directly.
  - Web `submitLessonResult`: drop the review re-read (`:249-250`) and return nothing.
  - `submitLessonResultMutation` in `Queries` (`libs/core-react/src/lib/queries.ts:100`): type it `void`, matching
    the desktop.
  - `lessons.integration.test.ts:255`: read the saved review with `getReviews`.
  Constraints: keep the empty-match `null` (`lessons.ts:177`).
  Done when: `DB lessons` and `bun run typecheck` pass.
  Manual verify: none — no behavior change; the uploader ignores the value.
  Commit: Drop the lesson repo's dead branch and unused review return
  Depends on: 11

- [ ] 15. Drive a lesson by keyboard in the e2e suites
  Goal (L11):
  - Add one flow to `apps/web-e2e/src/lesson-controls.spec.ts` and its twin in `apps/electron-e2e/src`.
    Use the default bindings.
  - Steps:
    - open a lesson and Start it;
    - press `3` before submit: the card stays;
    - press Space to submit; release `3` to grade Good: the next card shows;
    - press Escape: the confirmation shows; press `3`: nothing changes; "Continue studying": the same card;
    - finish the lesson and close it with `Alt+C` ("Close popover").
  - Keep the two specs step for step; put shared steps in `libs/e2e` only if its README says so.
  Constraints:
  - Do not run either suite (`agents/VERIFY.md`).
  - Typecheck only: `nx run web-e2e:typecheck` and `nx run electron-e2e:typecheck`.
  Done when: both typechecks pass.
  Manual verify: the human runs `lesson-controls` on both hosts.
  Commit: Drive a lesson by keyboard in the e2e suites
  Depends on: 4

- [ ] 16. Default the Learn daily limit to unlimited
  Goal (L17; question 4):
  - TS: `createLearningDailyLimitValidation` (`libs/app/src/lib/settings-learning.ts:48-58`) accepts a `null`
    default, and Learn (`:126`) defaults to `null`, not counting toward Total.
  - Rust: `default_learn_limit` (`crates/koloda/src/domain/settings_learning.rs:206-211`) has `value: None`.
    `deserialize_counted_limit_with` (`:264-295`) takes an `Option<u32>` default, and `deserialize_learn_limit`
    (`:304-309`) passes `None`.
    The module comment (`:8`) stays true.
  - Twin cases: a stored row with no `learn`, and one with `learn: {}`, read as unlimited and not counted.
    TS: `libs/app/src/lib/settings-learning.test.ts`; Rust: `crates/koloda/tests/domain/settings_learning_tests.rs`.
    Update the cases that pin Learn's old default against a literal.
  - LEARNING-SETTINGS.md §Daily Limits: state the first-setup values.
    Total 200; New 50 and Review 200, each counting toward Total; Learn unlimited, not counting toward Total.
    The spec states no defaults today.
  - Both hosts seed from `DEFAULT_LEARNING_SETTINGS` (`apps/web/src/app/setup.ts:64`,
    `apps/electron-react/src/app/setup.ts:30`); they need no change.
  Constraints:
  - No migration; stored rows keep their values.
    A row without `learn` now reads as unlimited; the app always writes the field, so only hand-edited rows change.
  - Check the e2e lesson and learning-settings form specs on both hosts for expectations built on Learn 0.
    Update them as twins, typecheck only.
  Done when:
  - `APP settings-learning` and `RS settings_learning` pass;
  - the twin cases fail against the old default;
  - `nx run web-e2e:typecheck` and `nx run electron-e2e:typecheck` pass if a spec changed.
  Manual verify (web, a fresh profile):
  - Settings → Learning → Learn shows Unlimited, with counts toward total off.
  - Grade a new card Again → close → once it is due, its Learn badge opens with an amount of 1, and Start is enabled.
  Commit: Default the Learn daily limit to unlimited
  Depends on: none

- [ ] 17. Refresh the Dashboard lesson counts every minute
  Goal (L18; question 5):
  - `libs/srs-react/src/lib/lessons/lessons.tsx:14`: add `refetchInterval: 60_000` to the overview query.
  - WHY: the counts are cards ready now, which change with the clock, and no mutation invalidates the clock.
  - LESSONS.md §Lessons Overview: the counts refresh every minute while the Dashboard is open.
    Closing a lesson's refresh stays in §Starting a Lesson.
  - A component case in a new `lessons.test.tsx`, under fake timers: `getLessons` runs again after 60 s, not before.
  Constraints:
  - The overview query only; the lesson dialog's filtered key and the totals stay as they are.
  Done when:
  - `SR lessons.test` passes;
  - the case fails without the interval.
  Manual verify (web):
  - Grade a new card Again (one-minute step) → Close → stay on the Dashboard.
  - Within about two minutes, its Learn badge shows 1 with no navigation.
  Commit: Refresh the Dashboard lesson counts every minute
  Depends on: none

- [ ] 18. Describe a failed lesson prepare and point repeated key rules home
  Goal (L6, L7) in LESSONS.md:
  - §Completion: when the counts, today's totals, or the learning settings fail to load as the dialog opens, the
    lesson finishes the same way, with that error.
  - Closing: §Phases owns the per-phase effect of Escape, "Close popover", and the close control.
    §Early Termination owns the confirmation.
    Make §Starting a Lesson (line 77), §Hotkeys (lines 91-92, 99-100), §Init (line 143), §Completion (line 290), and
    §Early Termination (lines 301-302) point to them.
  - Enter and Space: §Submitting a Card owns them; §Hotkeys (lines 101-102) and §Field Operations (line 199) point
    there.
  - Key release: §Hotkeys (line 95) owns it; §Grading (lines 239-240) points there.
  Constraints:
  - LESSONS.md only, with no change in meaning.
  - Items 1, 7, and 17 edit other lines of this file; keep their text.
  Done when: `bun run check:markdown` passes, and every `§` pointer names an existing heading.
  Manual verify: none — spec only.
  Commit: Describe a failed lesson prepare and point repeated key rules home
  Depends on: 1, 7, 17

## Outcome

<what shipped>
