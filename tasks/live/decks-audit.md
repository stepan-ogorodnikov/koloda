# Decks audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, docs/specs/DECKS.md, docs/specs/ALGORITHMS.md, docs/specs/TEMPLATES.md, docs/specs/LEARNING-SETTINGS.md, docs/specs/SYNC.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/VERIFY.md, agents/I18N.md, agents/RUST.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, agents/BACKWARDS-COMPATIBILITY.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/MARKDOWN.md, apps/web-e2e/README.md, apps/electron-e2e/README.md, libs/e2e/README.md, agents/REVIEW.md
Flow: local

## Intent

Settle every remaining finding of the decks audit as one task.
It also takes the "editor twins": the same two form defects in the preset, template, and learning settings editors.

- The decks audit covered the behavior owned by `docs/specs/DECKS.md`.
  That is adding decks with defaults, editing title, notes, algorithm, and template, cascade delete, and the deck list.
  The report was `tmp/audits/decks.md`, written at `d32fb02e` (`main`).
- Its finding 5 was fixed by `tasks/archive/cards-audit.md` (item 3, `e884a0f7`).
  It is recorded here, not planned.
- The algorithms audit (same commit) finding 6 is the preset editor's twin of decks finding 4.
  Its finding 11 adds `clone-algorithm.tsx` to decks finding 6's sites; only that bullet is taken here.
- The learning settings audit (same commit) finding 2 is the learning settings form's twin of decks finding 4.

This file restates every finding and its evidence, so neither the next session nor the archive reader needs the reports.

Triage checked each finding again at `0fcd9722`, where this task branches.
Since `d32fb02e`, the deck code changed only under the cards and assistant tasks:

- `deck-details.tsx` and `delete-deck.tsx` gained D5's invalidations;
- the form `Controls` submit hotkey now needs a dirty form (`630a939f`);
- web `addDeck` runs in one transaction, and `decks.integration.test.ts` gained an ordering case (`:132`);
- the assistant gained `notifyAddDeckStillRunning` in `add-deck-query-invalidation.ts`.

`add-deck.tsx`, both pickers, the srs deck schema, the Rust deck code, DECKS.md, and the deck e2e specs are unchanged.
Every remaining finding holds.
Line numbers below are at `0fcd9722`.

Triage re-ran the audit's jsdom probes at `0fcd9722` with the same results:

- Without StrictMode, New deck submitted `{ title: "German", algorithmId: "", templateId: "" }`.
  No add ran, and the alert read "unknown".
  With StrictMode, add received both default ids (D1).
- With StrictMode, a second submit while the first add was pending ran add a second time (D6).
- Details with a notes edit, then the deck refetched as "Renamed on B".
  The title box still read "Original", and Save sent the old title (D4).

Finding 1 was not checked in a production browser build; agents do not start the app (AGENTS.md).

The decks report's verdict: the data layer is sound.
Zod and the Rust validator agree on titles, notes, and existence codes.
Delete cascades in one transaction on both hosts, and the Rust suite pins the cascade and the full row.
The defects are in the React forms and the cache around them.

Done when, in user-visible terms:

- New deck adds with only a title in production builds, using the default preset and template;
- Add and Clone in the deck, preset, and template dialogs cannot create two entities from one quick double press;
- on desktop, a deck, preset, template, or learning settings form with unsaved edits shows a field synced from another
  device, and Save keeps it instead of reverting it;
- a malformed preset or template id reports its own error on both hosts;
- the delete confirmation says how many cards the deck holds;
- DECKS.md, ALGORITHMS.md, and TEMPLATES.md say how title and notes length is counted, and DECKS.md has one home per
  rule;
- the deck repos, Rust deck tests, and deck e2e flows check outcomes;
- `bun run check:push` passes on the tip, and every plan item is one commit with a `Task:` trailer.

## Scope

Entries use the report's numbers with a prefix: `D` for decks, `A` for algorithms, `L` for learning settings.

### Decks

- D1. Spec violation, Must-fix: in production builds, New deck fails unless the user changes both pickers.
  Decision: fixed by item 1.
  - DECKS.md §Adding Decks (lines 33-35): the user adds a deck with a title and the offered algorithm and template.
    Line 43: after a successful add, the dialog offers a link to the new deck.
  - The form starts with empty ids (`libs/srs-react/src/lib/decks/add-deck.tsx:36`).
  - Each picker writes the default id into the form on mount when its value is empty.
    It shows `value || default` meanwhile (`algorithm-picker.tsx:23-25`, `:33`; `template-picker.tsx:23-25`, `:33`).
  - `AddDeck` resets the form whenever `isOpen` changes (`add-deck.tsx:62-65`).
    The pickers mount in the commit that opens the dialog, and React runs a child's effects before its parent's.
    So the reset runs after the pickers wrote their defaults and empties both ids again.
  - The pickers' effects do not run again: `value` was `""` before and is `""` after the reset.
    The selects keep showing the defaults.
  - On submit, the `onSubmit` validator (`add-deck.tsx:37`) fails `z.uuid()` on both ids with zod's "Invalid UUID".
    That is not a catalog code, so the dialog shows "unknown" (`libs/ui/src/lib/primitives/form/form.tsx:74`).
  - StrictMode re-runs effects only in development; the app wraps everything in it
    (`libs/app-react/src/lib/app-providers.tsx:70`).
    Both e2e suites serve a Vite dev server (`apps/web-e2e/playwright.config.ts:35-36`,
    `apps/electron-e2e/playwright.config.ts:25-26`), so `deck-add` and every `createDeck` pass there.
    The web deploy and the packaged desktop app run production builds.
  - Changing only one picker leaves the other id empty; `deck-add`'s custom preset and template cases do that.
  - Scenario: in the packaged desktop app, New deck → a title → Add deck shows an unknown error.
    Picking another preset and template, then the defaults again, works around it.
- D2. Spec violation, Later: the specs say "characters"; both hosts count UTF-16 units.
  Decision: fixed by item 10; the specs are reworded, and the code is unchanged (question 4).
  - DECKS.md line 38 ("at most 255 characters long") and line 68 ("limited to 1,024 characters").
    ALGORITHMS.md lines 43, 73, 97 and TEMPLATES.md lines 112, 120 repeat the rules.
    `agents/FUNCTIONAL-SPECIFICATIONS.md` (Principles) makes the three specs a deliberate repeat that moves together.
  - TS limits by JS `.length` (`libs/app/src/lib/titles.ts:17-20`, `:36-42`).
    Rust counts `encode_utf16()` to match (`crates/koloda/src/domain/common.rs:80-82`, `:34-36`).
  - Both suites pin it: "rejects 128 emoji as 256 UTF-16 units" (`libs/srs/src/lib/titles.test.ts:43`) and
    `test_insert_deck_title_max_length_in_emoji_fails` (`crates/koloda/tests/domain/decks_title_tests.rs:53`).
  - So a title of 128 emoji, 128 characters to the user, is rejected.
- D3. Spec hygiene, Later: DECKS.md restates its own and a sibling's rules.
  Decision: fixed by item 11.
  - Line 29 ("Lessons can target one deck or all decks; available counts are computed per deck") restates LESSONS.md
    (§What it is, §Lessons Overview) without a pointer.
  - The cascade is in §Relationships (line 27) and again in §Deleting Decks (lines 89-93).
  - "The current template is used for new cards" appears three times (lines 15, 21, 76).
    So does "the algorithm schedules this deck's grades" (lines 14, 26, 73).
  - LEARNING-SETTINGS.md §Defaults is pointed at twice (lines 28 and 35).
  - Scope line 8 names ASSISTANT-DATA-ACCESS.md, but line 7 names no assistant topic that the spec leaves out.
- D4. Risk, Should-fix: on desktop, a dirty Details form writes back a field that sync just changed.
  Decision: fixed by item 3; fields the user has not edited take the synced value live (question 2).
  Item 4 applies the same fix to the template editor, which the report names as a site.
  - `crates/koloda-sync-proto/PROTOCOL.md` §Field groups and merge: "Writes to different groups of the same entity
    never conflict".
    §Collision outcomes: "Rename a deck on A, edit its notes on B | Both survive; different groups".
  - Groups: decks `title`, `notes`, `algorithm`, `template`; templates and algorithms `title`, `notes`, and
    `structure` or `content` (the form's `content`); learning settings `defaults.algorithm`, `defaults.template`,
    `dailyLimits`, `dayStartsAt`, `learnAheadLimit`.
  - The Details form takes its defaults from the deck query (`deck-details.tsx:23-25`).
    A remote change invalidates `decks`, which refetches the open deck
    (`apps/electron-react/src/app/sync-events.ts:15`).
  - TanStack Form 1.25 adopts new defaults only while the whole form is untouched.
    `FormApi.update` requires `!this.state.isTouched` (`@tanstack/form-core/dist/esm/FormApi.js:64`).
  - Save sends all four fields (`deck-details.tsx:27-28`); the Rust payload requires them all
    (`crates/koloda/src/domain/decks.rs:40-49`).
  - `update_deck` compares each group with the row as stored now (`crates/koloda/src/repo/decks.rs:191`, `:218-243`).
    An old value in an untouched field differs from the synced row.
    It is captured as a new write with a fresh stamp, and it wins on every device.
  - The template editor has the same shape (`libs/srs-react/src/lib/templates/template.tsx:24-41`).
  - The web host does not sync, so it is not affected.
  - Scenario: the user renames a deck on the laptop while editing its notes on the desktop.
    The desktop saves the notes, and the deck goes back to its old name on both devices.
- D5. Risk, Should-fix: deck edit and delete left Dashboard data stale.
  Decision: fixed by `cards-audit` item 3 (`e884a0f7`, on `main`); nothing planned here.
  Edit now invalidates `lessons.all()` (`deck-details.tsx:33-34`); delete invalidates `todayReviewTotals()`
  (`delete-deck.tsx:32`).
- D6. Risk, Later: Add can run again while the first add is pending.
  Decision: fixed by item 2, with A11's clone-algorithm site.
  - The Add button is disabled only by `!canSubmit || isLinkVisible` (`add-deck.tsx:126`).
    `onSubmit` calls `mutate` without awaiting (`:43-44`), so the form's submitting state ends at once.
    Nothing reads the mutation's pending state.
  - Titles may repeat (DECKS.md line 36), so nothing rejects the second deck.
  - The add-preset, add-template, and clone-template dialogs have the same shape (`add-algorithm.tsx:42`, `:115`;
    `add-template.tsx:42`, `:115`; `clone-template.tsx:33`, `:99`).
  - `add-card.tsx:47-62` already awaits `mutateAsync` (`cards-audit` item 4).
    TanStack Form 1.25 keeps `canSubmit` false while submitting (`FormApi.js:776`), and `handleSubmit` returns early
    then (`:889`).
- D7. Risk, Later: the hosts report different errors for a malformed algorithm or template id.
  Decision: fixed by item 6.
  - Rust rejects them with `validation.decks.algorithm` and `validation.decks.template` (`domain/decks.rs:67-68`,
    `:76-77`), pinned by `crates/koloda/tests/domain/decks_validation_tests.rs:28-55`.
  - TS reuses the bare `z.uuid()` of the algorithm and template ids (`libs/srs/src/lib/decks.ts:12-13`).
    The issue message is zod's "Invalid UUID", and the form shows "unknown".
  - The two codes have `en` and `ru` messages (`libs/app/src/lib/error.ts:56-57`) that only desktop IPC produces.
    The TS twin asserts only `success === false`, and its comment records the gap (`decks.test.ts:10-26`).
  - Precedent: a template field id passes its catalog code to `z.uuid` (`libs/srs/src/lib/templates.ts:28`).
- D8. Improvement, Should-fix: test gaps on both hosts.
  Decision: fixed by items 1 (component test) and 7.
  - `agents/TESTING.md` (Layers: full-field roundtrip; the twin rule; One home per behavior).
  - Web roundtrip: `libs/db-sqlite/src/lib/decks.integration.test.ts:17-45` keeps the same algorithm and template,
    never writes notes, and compares with `toMatchObject`.
    `rg -n notes libs/db-sqlite/src --glob '*.test.ts'` finds only `algorithms.integration.test.ts`.
    So the `notes` column of `DECK_SELECT` and `payload.notes ?? null` are never run by a web test.
    Rust has the roundtrip (`crates/koloda/tests/integration/decks_integration_tests.rs:9-56`).
  - Rust title trim: `rg -n 'normalize_required_title' crates/koloda/tests` finds nothing.
    No Rust test stores a padded title; if `repo/decks.rs:139` or `:187` stopped trimming, nothing would fail.
    The web twin exists (`decks.integration.test.ts:116-130`).
  - Web cascade: the delete test checks only the deleted deck
    (`libs/db-sqlite/src/lib/referential-integrity.integration.test.ts:44-83`).
    The Rust twin also checks that another deck keeps its cards (`decks_integration_tests.rs:197-207`).
  - Second doors: `decks.integration.test.ts:47-114` re-tests the `libs/srs` title rule (`titles.test.ts`) through the
    repo three times, with no WHY.
  - No component test: `libs/srs-react/src/lib/decks/` had none for the add and details forms.
- D9. Improvement, Later: Rust deck domain tests are per-cell.
  Decision: fixed by item 8.
  - `decks_title_tests.rs:5-76`: six tests that differ only in the title.
  - `decks_validation_tests.rs:28-55`: four tests that differ only in the field and the DTO.
  - `agents/TESTING.md` (Repetition and tables); the TS side holds the rules in one table (`titles.test.ts:14-45`).
- D10. Improvement, Later: the deck e2e specs skip outcomes and flows (same on both hosts).
  Decision: fixed by item 12.
  - `deck-add.spec.ts:39-49`: the empty-title step asserts only that the dialog is still open, never
    "Title can't be empty".
  - `fillAndSubmitDeck` (`deck-add.spec.ts:12-30`) picks a custom preset or template but asserts only the URL and the
    heading.
  - No deck spec edits notes on Details; none saves an invalid value (DECKS.md lines 79-80), opens a missing deck link
    (line 82), or deletes a deck that has cards (`deck-delete.spec.ts:9` uses an empty deck).
  - `deck-edit.spec.ts:17-39` and `deck-reset.spec.ts:17-39` create the preset and template inline.
    `createAlgorithm` and `createTemplate` (`libs/e2e/src/ui-flows.ts:132`, `:185`) already do that.
- D11. Improvement, Later: leftover residue.
  Decision: fixed by items 2 (the spread) and 5.
  - `deck-details.tsx:51-53`: the `form.reset()` effect runs only on mount.
    The route keys `DeckDetails` by deck id (`libs/app-react/src/lib/routes/_.decks.$deckId.tsx:63`), and the form
    was just built from the same defaults.
    `algorithm.tsx:45-47` and `template.tsx:44-46` have the same effect under the same key
    (`_.algorithms.$algorithmId.tsx:34`, `_.templates.$templateId.tsx:34`).
  - `deck-details.tsx:32` invalidates `decks.detail(id)`, which `decks.all()` on `:31` covers by prefix; `:38` then
    writes the same row with `setQueryData`.
  - `add-deck.tsx:44`: `schema.parse({ ...value })` copies the object for nothing; `add-algorithm.tsx:42` and
    `add-template.tsx:42` do the same.
  - `invalidateDeckQueriesAfterAddDeck` (`libs/assistant-react/src/lib/runs/add-deck-query-invalidation.ts:14-20`)
    copies `add-deck.tsx:48-52` key for key; the next deck key added to one will be missed in the other.
- D12. Product decision, Later: the delete confirmation does not say how much will be lost.
  Decision: fixed by item 9; it states the card count, not the review count (question 5).
  - The text is fixed: "Are you sure you want to delete this deck and all its cards and reviews?"
    (`delete-deck.tsx:55`; DECKS.md lines 86-87).
  - Delete cannot be undone and removes all review history.
  - The route already loads the deck's cards (`_.decks.$deckId.tsx:19`); a review count would need a new query on
    both hosts.

### Editor twins

- A6. Risk, Should-fix: on desktop, a dirty preset editor writes back parameters that sync just changed.
  Decision: fixed by item 4.
  - The editor's defaults come from the algorithm query (`libs/srs-react/src/lib/algorithms/algorithm.tsx:25-27`),
    and Save sends every field (`:29-30`).
  - `update_algorithm` writes each group that differs from the stored row
    (`crates/koloda/src/repo/algorithms.rs:231-255`).
    A content difference also records a revision by the user (`:247-248`).
  - Sync refetches algorithms on a remote change (`sync-events.ts:17`); TanStack adopts new defaults only while the
    form is untouched (D4).
  - Scenario: weights optimized and applied on the laptop sync to the desktop while its editor has an unsaved notes
    edit.
    Saving the notes writes the old weights back to both devices, and history records that revert as a user change.
- A11 (clone bullet only). Risk, Later: `clone-algorithm.tsx` has D6's shape.
  Decision: fixed by item 2.
  `mutate` without awaiting (`:33`), and Submit enabled while pending (`:99`).
  The rest of algorithms finding 11 (optimizer residue) stays with the algorithms triage.
- L2. Risk, Should-fix: on desktop, an edited learning settings form writes back keys that sync just changed.
  Decision: fixed by item 4, with the same helper; Save still sends the whole payload (question 2).
  - Each learning key is its own sync group; only changed keys are captured
    (`crates/koloda/src/repo/settings.rs:145-146`, `:100-117`).
  - The form takes its defaults from the settings query (`libs/settings-react/src/lib/settings-learning.tsx:64-68`).
    A remote learning change invalidates that query (`sync-events.ts:19`), and the route passes the new data down.
  - Save sends the whole payload (`settings-learning.tsx:69-71`).
    Rust captures every key that differs from the stored, now-synced document.
  - Scenario: on the laptop the user moves "Start of the day" to 06:00.
    On the desktop the settings screen is open, and the user changes the New limit and saves.
    The day start goes back to 05:00 on both devices.

### Out

- The other findings of `algorithms.md` and `learning-settings.md`, and all of `templates.md`.
  They are triaged separately.
- `media.md` findings 1 and 4 (the image editor's state follows the field's text).
  `tasks/archive/cards-audit.md` listed them among the editor twins, but they are a different mechanism in
  `card-content-text-area.tsx`; they stay with the media triage (question 1).
- The preset and template add specs' empty-title step (`algorithm-add.spec.ts:13-22`, `template-add.spec.ts:13-22`).
  It belongs to `algorithms.md` finding 10 and `templates.md` finding 10.
- Both e2e suites run on dev servers under StrictMode, which hid D1.
  The "e2e suites" concern audit should decide whether a suite runs a production build.
- `insertDeckSchema` accepts notes that both hosts drop: `templates.md` finding 13.
- The Details save and the deck delete keep their per-call `mutate` callbacks.
  Neither resets its mutation; they lose their refresh only if the page unmounts mid-write.
  Seen, not planned.

## Open questions

- [x] 1. Task shape? — the rest of `decks.md`, with `algorithms.md` finding 6, the clone-algorithm bullet of
  finding 11, and `learning-settings.md` finding 2.
  `media.md` findings 1 and 4 stay with the media triage (human, 2026-10-26).
- [x] 2. D4: how do untouched fields behave? — they take the synced value live, through one shared helper in the
  `libs/ui` form, in all four editors.
  Learning settings keeps the whole-payload save (human, 2026-10-26).
- [x] 3. Flow? — `local`, the default.
- [x] 4. D2: how is length counted? — reword the three specs; both hosts keep counting UTF-16 units (human,
  2026-10-26).
- [x] 5. D12: what does the confirmation state? — the card count; no review count (human, 2026-10-26).
- [x] 6. Confirm D1 in a production build before item 1? — not taken; the plan was approved without it.
  The jsdom probe without StrictMode reproduces it at `0fcd9722`; the fix and its test hold either way.
- [x] 7. Plan approved as written (human, 2026-10-26).

## Plan

`SR`, `SRS`, `UI`, `DB`, `AR`, and `SE` below stand for
`bunx vitest run --config <dir>/vitest.config.mjs --configLoader runner`.
Their dirs are `libs/srs-react`, `libs/srs`, `libs/ui`, `libs/db-sqlite`, `libs/assistant-react`, and
`libs/settings-react`.
`RS` stands for `cargo test -p koloda`.
Line numbers are at `0fcd9722`; when an earlier item moved them, find the code by its text.

- [x] 1. Seed the new deck's preset and template from the defaults
  Goal (D1, and D8's component test):
  - `AddDeck` default values (`add-deck.tsx:36`): seed `algorithmId` from `defaultAlgorithmAtom` and `templateId`
    from `defaultTemplateAtom` (`useAtomValue`, `@koloda/core-react`).
    The open-time `form.reset()` (`:62-65`) then restores the defaults instead of emptying them.
    Check in `@tanstack/react-form` that `useForm` calls `formApi.update(opts)` each render.
    Then `reset()` reads the current atoms, not the values at mount.
  - Pickers: drop the write-on-mount effect (`algorithm-picker.tsx:23-25`, `template-picker.tsx:23-25`).
    Drop the `value || default` display fallback (`:33` in both), so the select shows what the form holds.
    Drop `| null` from `AlgorithmPicker`'s `value` (`:13`) if no caller passes `null`.
    Details passes the deck's ids; learning settings passes its defaults (`settings-learning.tsx:99`, `:109`).
  - Tests in a new `libs/srs-react/src/lib/decks/add-deck.test.tsx`, rendered without `StrictMode`.
    Set the default atoms and stub the algorithms and templates queries (see `deck-cards.test.tsx` for the harness):
    - open, type a title, submit: add receives both default ids;
    - pick another preset only: add receives it and the default template.
  - WHY above the `describe`: both e2e suites serve dev builds under StrictMode.
    StrictMode re-runs the pickers' effects, which hid this bug there.
  Constraints: `add-deck.tsx`, both pickers, and the test.
  Done when:
  - `SR add-deck` passes;
  - the first case fails on the old effect-and-reset code.
  Manual verify (web, production build):
  - Build and serve the web app in production mode → Decks → New deck → type a title → Add deck.
  - The "Go to the new deck" link shows; the deck's Details show the default preset and template.
  - Skip if: no production build can be served locally; the packaged desktop app shows the same.
  Commit: Seed the new deck's preset and template from the defaults
  Depends on: none

- [x] 2. Await the add in the add and clone dialogs
  Goal (D6, A11's clone bullet, and D11's spreads):
  - In `add-deck.tsx:43-58`, `add-algorithm.tsx:42`, `add-template.tsx:42`, `clone-template.tsx:33`, and
    `clone-algorithm.tsx:33`: `await mutateAsync(schema.parse(value))` in a `try`/`catch`, as `add-card.tsx:47-62`
    does.
    On success, run each dialog's current success steps in their current order.
    The `catch` sets `formApi.setErrorMap({ onSubmit: toFormErrors(error) })`, as `onError` does now, and returns.
  - Drop the `{ ...value }` spreads (`add-deck.tsx:44`, `add-algorithm.tsx:42`, `add-template.tsx:42`).
  - One WHY per dialog: awaiting keeps the form submitting, so `canSubmit` stays false and a second press cannot add
    twice.
  - Tests, each with a gated add or clone promise: submit twice before it resolves, and the mutation runs once.
    - `add-deck.test.tsx` (item 1);
    - the preset and template add and clone dialogs in one new table-driven file,
      `libs/srs-react/src/lib/components/entity-add-dialogs.test.tsx`, with a render function per row.
  Constraints: the five dialogs and the tests; no other behavior change.
  Done when:
  - `SR add-deck entity-add-dialogs` passes;
  - each case fails with `mutate`.
  Manual verify (web):
  - Presets → New preset → type a title → double-click Add quickly → one new preset in the list.
  - Decks → New deck → a title → double-click Add deck → one new deck in the sidebar.
  Commit: Await the add in the add and clone dialogs
  Depends on: 1

- [x] 3. Keep synced values in deck fields the user has not edited
  Goal (D4):
  - New hook in `libs/ui/src/lib/primitives/form/`, exported from `@koloda/ui`:
    `useRefreshPristineFields(form, latest, paths)`.
    When `latest` changes, for each path:
    - skip it if any field meta at, under (`path.` or `path[`), or above it is dirty;
    - otherwise, if `getBy(form.state.values, path)` differs from `getBy(latest, path)` by `evaluate`, call
      `form.setFieldValue(path, value, { dontUpdateMeta: true })`.
    `getBy` and `evaluate` come from `@tanstack/react-form`, which re-exports `@tanstack/form-core`.
    The fields stay pristine, so `isDirty` and the Save bar do not change.
  - WHY on the hook: TanStack adopts new defaults only while the whole form is untouched (`FormApi.update`).
    Each path is one sync group, so saving an untouched group with its old value captures a fresh write that undoes
    the other device's change (PROTOCOL.md §Field groups and merge).
  - Discard needs no change: `update()` stores the latest `defaultValues` each render, and `reset()` reads them.
    Confirm that in `FormApi.js` and say it in the WHY.
  - `DeckDetails` (`deck-details.tsx:23-25`): call it with `data` and `["title", "notes", "algorithmId",
    "templateId"]`, the deck sync groups.
  - SYNC.md, after "Screens that show synced data refresh as changes arrive." (line 210):
    an open edit form keeps the user's unsaved changes, and its other fields take the synced values.
    So saving does not undo the other device's change.
  - Tests in a new `use-refresh-pristine-fields.test.tsx` beside the hook, on a real `useAppForm`:
    - edit notes, then a new `latest` with a new title: the title input shows it, notes keep the edit, and submit
      sends both;
    - path `content` with `content.fields[0].title` dirty: a new `latest` leaves `content` as the user has it;
    - an unchanged `latest` (a new object, equal values) sets nothing.
  Constraints:
  - The hook, `deck-details.tsx`, SYNC.md, and the test.
  - The path list is wiring, with no test of its own (`agents/TESTING.md` §When tests are required).
  - Implemented: the hook compares values, not field meta.
    A group follows the new data while its shown value still equals the data the form last saw.
    TanStack keeps a field's `isDirty` set after an edit is undone, so a meta check would keep a changed-back field
    stale.
    The tests are: untouched group follows while an edited one stays; a nested edit keeps its whole group; a field
    changed and changed back follows.
    The "unchanged `latest` sets nothing" case was dropped: no behavior can observe it.
  - Implemented: the SYNC.md sentence moved to item 4; it describes every edit form, which is true only after item 4.
  Done when:
  - `UI use-refresh-pristine-fields` passes;
  - the first two cases fail if the dirty check ignores descendants or ancestors;
  - `bun run check:markdown` passes.
  Manual verify (desktop, two devices in one space):
  - Device A: a deck's Details → edit the notes, do not save.
  - Device B: rename that deck.
  - On A the title field shows the new name; Save → both devices show the new name and A's notes.
  Commit: Keep synced values in deck fields the user has not edited
  Depends on: none

- [x] 4. Keep synced values in the preset, template, and learning editors
  Goal (A6, L2, and D4's template editor):
  - `Algorithm` (`algorithm.tsx:25-27`): `useRefreshPristineFields(form, data, ["title", "notes", "content"])`.
  - `Template` (`template.tsx:24-26`): the same paths.
    `content` is the `structure` group (fields and layout), so a dirty field row keeps the whole structure.
  - `SettingsLearning` (`settings-learning.tsx:64-68`): pass the parsed `initialValues` and
    `["defaults.algorithm", "defaults.template", "dailyLimits", "dayStartsAt", "learnAheadLimit"]`.
    `initialValues` is a new object each render; the hook compares by value, so it sets nothing then.
  - LEARNING-SETTINGS.md line 121 stays: Save still persists the whole payload.
  - SYNC.md, after "Screens that show synced data refresh as changes arrive." (line 210), moved here from item 3:
    an open edit form keeps the user's unsaved changes, and its other fields take the synced values.
    So saving does not undo the other device's change.
  Constraints:
  - The three editors and SYNC.md; wiring of item 3's hook, with no test of its own.
  - The add and clone dialogs do not sync while open; leave them.
  Done when:
  - `SR`, `SE`, and `bun run typecheck` pass;
  - `bun run check:markdown` passes.
  Manual verify (desktop, two devices in one space):
  - A: Settings → Learning → change the New limit, do not save; B: set "Start of the day" to 06:00.
  - On A the day start shows 06:00; Save → both devices keep 06:00 and A's New limit.
  - A: a preset → edit its notes; B: rename it → A shows the new title; Save keeps both.
  Commit: Keep synced values in the preset, template, and learning editors
  Depends on: 3

- [x] 5. Drop editor residue and share the add-deck refresh
  Goal (D11):
  - Drop the mount-only `form.reset()` effects (`deck-details.tsx:51-53`, `algorithm.tsx:45-47`,
    `template.tsx:44-46`).
    Each route keys its editor by id, and the form was just built from the same defaults.
  - `deck-details.tsx:32`: drop the `decks.detail(id)` invalidation.
    `decks.all()` (`:31`) covers it by prefix, and `:38` writes the row.
  - Move `invalidateDeckQueriesAfterAddDeck` (`add-deck-query-invalidation.ts:14-20`) to `libs/core-react`, beside
    the query keys, with its usage-count WHY.
    `AddDeck` (`add-deck.tsx:48-52`) and the assistant call it.
    `assistant-react` cannot import `srs-react` (`tools/workspace-deps/layers.ts`, `FEATURE_PEERS`), so
    `core-react` is the shared home.
    Update its imports and tests (`rg -n invalidateDeckQueriesAfterAddDeck libs apps`).
  Constraints: no behavior change.
  Done when: `SR`, `AR`, `bun run typecheck`, and `bun run check:workspace-deps` pass.
  Manual verify (web):
  - A deck's Details → change the title → Save → Discard stays hidden, and the sidebar shows the new title.
  - Decks → New deck → Add → the sidebar lists the new deck.
  Commit: Drop editor residue and share the add-deck refresh
  Depends on: 2, 4

- [x] 6. Give malformed deck references their catalog codes
  Goal (D7):
  - `deckValidation` (`libs/srs/src/lib/decks.ts:12-13`): `algorithmId: z.uuid({ message:
    "validation.decks.algorithm" })` and `templateId: z.uuid({ message: "validation.decks.template" })`, as
    `templates.ts:28` does.
  - `decks.test.ts:10-26`: assert the code per row, and drop the comment's gap note.
  - The codes already have `en` and `ru` messages (`libs/app/src/lib/error.ts:56-57`); Rust is unchanged.
  Constraints: `decks.ts` and its test.
  Done when:
  - `SRS decks` passes;
  - the table fails with the bare `z.uuid()`.
  Manual verify: none — after item 1 the UI cannot send a malformed id.
  Commit: Give malformed deck references their catalog codes
  Depends on: none

- [ ] 7. Test web deck notes and cascade isolation, and Rust title trimming
  Goal (D8):
  - `decks.integration.test.ts`:
    - replace the roundtrip (`:17-45`) with a full-field one: change title, notes, algorithm, and template, and compare
      the whole row.
      Then clear the notes and check they read back absent.
      Twin of `update_deck_round_trips_every_field` (`decks_integration_tests.rs:9-56`).
    - title cases (`:47-114`): keep one, with a WHY that the repo parses before it writes; delete the other two.
  - `referential-integrity.integration.test.ts:44-83`: a second deck with a card keeps it after the first deck is
    deleted (twin of `decks_integration_tests.rs:197-207`).
  - `decks_integration_tests.rs`: add and update with a padded title store it trimmed (`repo/decks.rs:139`, `:187`).
    Twin of web `decks.integration.test.ts:116-130`.
  Constraints: tests only; no repo code changes.
  Done when:
  - `DB decks referential` and `RS deck` pass;
  - the Rust case fails if either trim is removed.
  Manual verify: none — tests only.
  Commit: Test web deck notes and cascade isolation, and Rust title trimming
  Depends on: none

- [ ] 8. Table the Rust deck title and reference tests
  Goal (D9):
  - `decks_title_tests.rs:5-76`: one table of title and expected result (the code, or ok), replacing the six tests.
  - `decks_validation_tests.rs:28-55`: one table over the DTO (insert, update) and the field, asserting the code,
    replacing the four tests.
  - Write each table and delete the tests it replaces in this commit (`agents/TESTING.md` §Repetition and tables).
  Constraints: the two test files.
  Done when: `RS --test domain deck` passes with the same rows.
  Manual verify: none — tests only.
  Commit: Table the Rust deck title and reference tests
  Depends on: none

- [ ] 9. State the card count in the deck delete confirmation
  Goal (D12):
  - `DeleteDeck` (`delete-deck.tsx`): read the deck's cards from `getCardsQuery({ deckId: id })`; the route loader
    already ensures it (`_.decks.$deckId.tsx:19`).
  - Message (`:55`): `plural(count, { other: "delete-deck.message" })`, as `settings-sync-status.tsx:47` does.
    - `en`: `=0` "Are you sure you want to delete this deck?"; `one` "…delete this deck and its # card with its
      reviews?"; `other` "…delete this deck and its # cards with their reviews?".
    - `ru`: the same with `one`, `few`, `many`, and `other`.
    - Every form starts "Are you sure you want to delete this deck", which both `deck-delete` specs assert (`:26`,
      `:27`).
    - Extract and compile both apps per `agents/I18N.md`; keep only the deck message's catalog changes.
  - DECKS.md §Deleting Decks (line 87): the confirmation states how many cards the deck holds.
    It says they and their reviews will be removed.
  Constraints:
  - `delete-deck.tsx`, the catalogs, and DECKS.md.
  - Copy and wiring, with no unit test of its own; item 12's delete flow asserts the count.
  Done when:
  - `SR`, `bun run typecheck`, and `bun run check:markdown` pass.
  Manual verify (web):
  - A deck with 2 cards → Details → Delete → "…its 2 cards with their reviews?".
  - An empty deck → Delete → "Are you sure you want to delete this deck?".
  - Switch the language to Russian → the count uses the right plural form.
  Commit: State the card count in the deck delete confirmation
  Depends on: none

- [ ] 10. Say how title and notes length is counted
  Goal (D2; question 4):
  - DECKS.md lines 38 and 68, ALGORITHMS.md lines 43, 73, and 97, TEMPLATES.md lines 112 and 120.
    Each keeps its limit and says that some characters, such as emoji, count as two.
  - The three specs move together (`agents/FUNCTIONAL-SPECIFICATIONS.md`, Principles); word them the same.
  Constraints: the three specs only; no code change.
  Done when: `bun run check:markdown` passes.
  Manual verify: none — spec only.
  Commit: Say how title and notes length is counted
  Depends on: 9

- [ ] 11. Keep one home per deck rule in DECKS.md
  Goal (D3), in DECKS.md:
  - §Relationships owns the template rule (cards added or generated into the deck use its current template) and the
    algorithm rule (line 26).
    §What it is (lines 14-15), the Core model item (line 21), and §Editing Decks (lines 73, 76) drop their copies or
    point there.
  - §Deleting Decks owns the cascade (lines 89-93); §Relationships drops line 27.
  - Line 29: replace with a pointer to LESSONS.md (§Lessons Overview).
  - Keep one LEARNING-SETTINGS.md (§Defaults) pointer, in §Adding Decks (line 35); drop line 28.
  - Scope line 8: drop ASSISTANT-DATA-ACCESS.md, or name the assistant topic left out on line 7.
  Constraints:
  - DECKS.md only, with no change in meaning.
  - Items 9 and 10 edit other lines of this file; keep their text.
  Done when:
  - `bun run check:markdown` passes;
  - every `§` pointer names an existing heading.
  Manual verify: none — spec only.
  Commit: Keep one home per deck rule in DECKS.md
  Depends on: 9, 10

- [ ] 12. Check deck flows by outcome in both e2e suites
  Goal (D10), on both hosts, step for step:
  - `deck-add.spec.ts`: the empty-title step (`:39-49`) asserts "Title can't be empty".
    After each custom add (`fillAndSubmitDeck`, `:12-30`), open Details and check the chosen preset and template.
  - `deck-edit.spec.ts`:
    - edit the notes, save, leave and reopen Details: the notes show;
    - clear the title and save: "Title can't be empty" shows, and the saved title is unchanged after Discard.
    - Visit a missing deck id: not found shows (DECKS.md line 82).
  - `deck-delete.spec.ts`: delete a deck with one card (`createDeckWithCard`, `libs/e2e/src/ui-flows.ts:114`).
    The confirmation states 1 card (item 9), and after confirming, the deck's Dashboard row is gone.
  - `deck-edit.spec.ts:17-39` and `deck-reset.spec.ts:17-39`: use `createAlgorithm` and `createTemplate`
    (`ui-flows.ts:132`, `:185`) instead of the inline steps.
  Constraints:
  - Do not run either suite (`agents/VERIFY.md`).
  - Shared steps go in `libs/e2e` only if its README says so.
  Done when: `nx run web-e2e:typecheck` and `nx run electron-e2e:typecheck` pass.
  Manual verify: the human runs `deck-add`, `deck-edit`, `deck-delete`, and `deck-reset` on both hosts.
  Commit: Check deck flows by outcome in both e2e suites
  Depends on: 1, 9

## Outcome

<what shipped>
