# Cards audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, docs/specs/CARDS.md, docs/specs/TEMPLATES.md, docs/specs/DECKS.md, docs/specs/HOTKEYS.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/VERIFY.md, agents/CSS.md, agents/I18N.md, agents/RUST.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, agents/BACKWARDS-COMPATIBILITY.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/MARKDOWN.md, apps/web-e2e/README.md, apps/electron-e2e/README.md, libs/e2e/README.md, agents/REVIEW.md
Flow: local

## Intent

Settle every remaining finding of the cards audit as one task.
It also takes the templates and decks findings that add cache refreshes to the same card paths.

- The cards audit covered the behavior owned by `docs/specs/CARDS.md`.
  That is card content, scheduling state, adding (single and batch), editing, review history, deleting, resetting
  progress, preview, the table and stack views, and what rendered markdown may contain.
  Its report was `tmp/audits/cards.md`.
- Its findings 1 and 18 were fixed by `tasks/archive/lessons-audit.md` (items 1 and 6).
  They are recorded here, not planned.
- The templates audit (`tmp/audits/templates.md`) finding 1 is a stale lock status.
  Its fix adds a template refresh to the card paths here.
- The decks audit (`tmp/audits/decks.md`) finding 5 is stale Dashboard data after a deck edit or delete.
  Deck delete is a fifth site for cards finding 9.
- `tasks/archive/assistant-data-access-card-generation-audit.md` (Scope, Out) handed over `add-card.tsx`.
  It refreshes from per-call `mutate` callbacks, the same defect as that task's card generation C1.
  It is entry C22.

All three audits read `d32fb02e` (`main`).
Git ignores the reports.
This file restates every finding and its evidence, so neither the next session nor the archive reader needs them.

Triage checked each finding again at `b662537e`, where this task branches.
In the cards code, `git diff --stat d32fb02e..b662537e` lists only two changes.
They are `card-preview-reducer.ts` (C18's fix) and CARDS.md line 30 (C1's fix).
The lesson files changed under the lessons task, and the assistant's card save moved to `mutateAsync`.
Every remaining finding holds.
Line numbers below are the report's, except two cited at `b662537e`.
They are the assistant's card save and the web deck delete, which moved under the assistant tasks.
Triage read the cited lines and did not run tests.
It added entry C22 and confirmed its mechanism in TanStack's source.

The cards report's verdict: the persistence layer is in good shape.
The two hosts' card repos match statement for statement.
Both validate a missing content key with the translated field-empty code.
Both reset scheduling in one transaction that leaves the update time alone.
Rendered markdown is defended in depth, and the desktop link policy is tested.
The defects sat where the card's own template meets the lesson (C1, fixed), and in the UI state around the table and
stack.

Done when, in user-visible terms:

- searching, filtering, or deleting never leaves the cards table on an empty page;
- deleting in the stack view shows a card and a true counter;
- `Mod+S` on an unchanged form does nothing, so a card's update time moves only on an edit;
- bulk delete removes only the selected cards that the search and filters show;
- table headers and the template filter follow the templates the cards use;
- after a card or deck change, today's totals, the Dashboard deck titles, and the template lock status are current;
- closing the add-card dialog mid-add still refreshes the deck's cards, and Add cannot run twice;
- web card insert rejects invalid progress fields as desktop does;
- neither host stores content keys that are not fields of the card's template;
- card preview submits with Enter or Space and focuses "Continue";
- the card details view offers preview, so narrow screens can preview;
- a failed progress reset shows its error;
- widening the window restores the chosen card view;
- markdown never renders unsanitized;
- CARDS.md and HOTKEYS.md match the code;
- `bun run check:push` passes on the tip, and every plan item is one commit with a `Task:` trailer.

## Scope

Entries use the report's numbers with a prefix: `C` for cards, `T` for templates, `D` for decks.
C22 was handed over by the assistant task and re-checked at triage.

### Cards

- C1. Spec violation, Must-fix: a lesson rendered a card with its deck's current template, not its own.
  Decision: fixed by `lessons-audit` item 1 (`30cb638e`, on `main`); nothing planned here.
  CARDS.md §Relationships is the one home, and LESSONS.md points to it.
- C2. Spec violation, Must-fix: the cards table strands the user on an empty page.
  Decision: fixed by item 1.
  - CARDS.md §Table View (lines 180, 195, 197): a paginated table with full-text search and a chosen page size.
  - The cards table preset sets `autoResetPageIndex: false` with no WHY
    (`libs/ui/src/lib/primitives/table/table-features.ts:65`).
    TanStack then never resets the page index when filtering or data shrink the rows
    (`rowPaginationFeature.utils.js:35-36`).
  - Nothing else resets it.
    The search box only sets the global filter (`libs/srs-react/src/lib/cards/cards-table.tsx:197-200`).
    The filters only set filter state (`cards-table-filters.tsx`).
    Deletes only invalidate the card list.
  - The paginated model slices `[pageIndex * pageSize, …)`, so a page past the end is empty
    (`createPaginatedRowModel.js:32-35`).
  - The footer hides every page button when there is one page (`table-pagination.tsx:37-40`, `:62`).
    It computes "start" from the stale index (`:33`).
  - Audit probe: 40 cards, page size 15, the last page, then a search for "card 3" (11 matches).
    The body had 0 rows, the footer read "31-11 of 11", and no page button rendered.
  - Scenario: a search, a filter, or deleting the last card on the last page while not on page 1.
    The table looks empty although cards match; only clearing the search or leaving the deck gets out.
- C3. Spec violation, Should-fix: deleting the last card in the stack view leaves a blank view and a wrong counter.
  Decision: fixed by item 5.
  - CARDS.md §Stack View (lines 201-203): one card at a time; "A counter shows the current position and the total
    number of cards."
  - `CardsStack` keeps `index` in local state and never clamps it (`cards-stack.tsx:22-23`).
  - The details in the stack carry the delete action (`card-details.tsx:147`).
    After a delete the list refetches, and `cards[index]` is `undefined` (`cards-stack.tsx:60`).
  - The counter renders `index + 1` over the new length (`cards-stack.tsx:48-53`).
  - Audit probe: 3 cards, moved to the third, the list shrank to 2: no card rendered, and the counter read "3/2".
  - On narrow screens the stack is the only view (§Card Views), so this is the common delete path there.
- C4. Spec violation, Should-fix: the form Submit hotkey saves an unedited card and moves its update time.
  Decision: fixed by item 6.
  - CARDS.md §Editing Cards (line 127): "The card's update timestamp changes only when content is edited."
  - The shared form `Controls` submit hotkey checks only `form.state.canSubmit`
    (`libs/ui/src/lib/primitives/form/form.tsx:129-135`).
    A pristine, valid form can submit; the visible Save button renders only while the form is dirty (`:162`).
  - `CardDetails` submits whatever the form holds (`card-details.tsx:31-43`).
  - Both hosts write `updated_at = now` on every update, changed or not: web `libs/db-sqlite/src/lib/cards.ts:147-151`,
    desktop `crates/koloda/src/repo/cards.rs:301-303`.
    Desktop sync capture skips unchanged content (`cards.rs:308`), so the new local time never reaches other devices.
  - Audit probe: the stack view with an unedited card; `Ctrl+S` called the update once, with the stored content.
  - `Controls` serves seven forms (`rg -n '<form.Controls' libs`): card details, deck details, template, algorithm,
    assistant settings, hotkey settings, learning settings.
    HOTKEYS.md §Forms (line 66) says Save "does nothing while the form cannot be submitted"; it needs the new rule.
- C5. Spec violation, Should-fix: column headers and the template filter count the deck's unused current template.
  Decision: fixed by item 8.
  - CARDS.md §Table View: content columns align by field position when cards use more than one template (line 185).
    If titles agree, that title is the header (line 186).
    The template filter shows "when more than one template is in use" (line 193).
  - `useCardsTemplates` always adds the deck's current template (`use-cards-templates.ts:12`).
    So do the headers (`cards-table-utility.ts:25-26`) and the filter's check (`cards-table-filters.tsx:27`).
  - Audit probe: every card on T1 (Front/Back), the deck on T2 (Question/Answer).
    The headers read "#1" and "#2", and the Template filter appeared.
  - Scenario: after a deck's template changes, an all-T1 table loses its column names and offers a one-choice filter.
- C6. Spec violation, Later: preview submits differently from a lesson.
  Decision: fixed by item 12.
  - CARDS.md §Card Preview (lines 166-167): "field operations, submit, reveal, and typed-answer comparison behave as
    in a lesson."
    LESSONS.md §Submitting a Card: Enter or Space submit outside text fields; "Continue" is focused when there is no
    type field.
  - The lesson registers Enter and Space (`libs/srs-react/src/lib/lessons/lesson-studying.tsx:28`).
    It focuses "Continue" (`lesson-footer.tsx:37-41`).
  - `CardPreview` registers no hotkey, and its "Continue" gets no focus (`card-preview.tsx:59-69`).
    Only Enter inside a type field submits, through the shared field (`lesson-card-field-text.tsx:33-35`).
  - Scenario: previewing a reveal-only card, Space and Enter do nothing; the user must click "Continue".
- C7. Spec violation, Later: the spec and the views disagree on which timestamps show.
  Decision: fixed by item 19 (spec follows the code).
  - CARDS.md §Table View (line 181): each row shows "timestamps for creation and last update".
    §Editing Cards (line 120): the details view "always shows creation and update timestamps".
  - The table hides both timestamp columns by default (`cards-table.tsx:35-38`); the Columns menu shows them.
  - The details view renders no update time for a card never edited (`form.tsx:39-43`).
    `updated_at` is `NULL` until the first edit (`libs/db-sqlite/src/lib/cards.ts:52`).
- C8. Spec hygiene, Later: CARDS.md restates three rules.
  Decision: fixed by item 19.
  - `agents/FUNCTIONAL-SPECIFICATIONS.md` (One home per rule).
  - "Deleting or resetting removes the review history": §Review History (line 138), §Deleting Cards (line 145),
    §Resetting Progress (line 156).
  - "A card belongs to exactly one deck": §What it is (line 16) and §Relationships (line 27).
  - The template-lock pointer: §Relationships (line 36) and §Card Content (lines 49-50).
- C9. Risk, Should-fix: card delete and reset leave today's review totals stale.
  Decision: fixed by item 3, with D5's deck delete; item 20 adds the reset case to both e2e suites.
  - LEARNING-SETTINGS.md §Learning Day: "Today's review totals count every review created inside that window."
    CARDS.md §Review History (line 138): delete and reset remove the card's reviews.
  - The four card paths that delete reviews invalidate the card list and lesson counts.
    None invalidates `queryKeys.lessons.todayReviewTotals()`:
    - reset: `card-details.tsx:55-57`;
    - delete from details: `delete-card.tsx:31-32`;
    - delete from a row: `cards-table-cell-delete-card.tsx:35-36`;
    - bulk delete: `cards-table-selection-controls.tsx:41-42`.
  - `rg -n 'todayReviewTotals\(\)' libs apps` finds only the two host queries, the lesson close path
    (`use-lesson-close.ts:29`), desktop sync, and tests.
  - Desktop sync invalidates the totals for the `cards` kind (`apps/electron-react/src/app/sync-events.ts:8`, `:13`).
    So a change from another device refreshes them, and a local one does not.
  - The query client's WHY rests on mutations invalidating what they change (`app-providers.tsx:56-61`).
  - Scenario: a card studied today is reset or deleted.
    The Dashboard's today figures and the next lesson's default amounts still count its reviews until the cache goes
    stale.
- C10. Risk, Should-fix: bulk delete removes selected cards that a search or filter hides.
  Decision: fixed by item 7; selection survives filtering, and the count and delete cover only visible matches
  (question 2).
  - CARDS.md §Table View (line 192): "bulk delete on the selected cards"; §Deleting Cards (line 147).
  - The ids to delete come from `table.getSelectedRowModel()` (`cards-table.tsx:177`).
    That model reads the core rows, before filtering (`rowSelectionFeature.utils.js:128-135`).
    So rows hidden by the search, state, or due filter stay selected and are deleted.
  - The template filter instead removes rows from `data` (`cards-table.tsx:146-150`).
    A selected card hidden by it drops out of the count and is not deleted.
    It reappears still selected when the filter clears.
  - Audit probe: 3 cards, all selected; a search left 1 visible; confirming the bulk delete sent 3 ids.
- C11. Risk, Should-fix: the web insert schema drops the progress-field check.
  Decision: fixed by item 10.
  - `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` §Split source of truth: for shared entities "Both sides must agree".
    `agents/TESTING.md` (The TS ↔ Rust twin rule).
  - `getInsertCardSchema` builds `z.object({ ...insertCardSchema.shape, … })` (`libs/srs/src/lib/cards.ts:80-83`).
    Spreading `.shape` drops the `superRefine(refineCardProgress)` on `insertCardSchema` (`:85`).
  - Rust validates the same fields on every insert (`crates/koloda/src/domain/cards.rs:209-229`).
    `add_card_rejects_invalid_progress_state` pins it
    (`crates/koloda/tests/integration/cards_integration_tests.rs:120`).
    No web test has the twin.
  - The web repo inserts first and reads back through `cardRowSchema`, which does run the check
    (`libs/db-sqlite/src/lib/cards.ts:46-72`; `libs/srs/src/lib/cards.ts:38`), with no transaction around the pair.
  - Audit probe: `getInsertCardSchema(t).safeParse({ …, state: 999 })` succeeded, and `insertCardSchema` rejected it.
    `addCard` with `state: 999` and `addCards` with `state: -5, reps: -1` both reported failure.
    Both rows were in the table afterwards, and `getCards` for that deck threw a `ZodError`.
  - No production caller sends progress fields: the add form, the assistant batch, and the web seed send defaults.
  - `host-desync.md` finding 2 (rows validated on read) is the general case; it stays with the host-desync triage.
- C12. Risk, Later: unknown content keys survive one write path in three.
  Decision: fixed by items 10 (web `addCard`) and 11 (desktop); keys outside the template are dropped on both hosts
  (question 4).
  - Web `addCard` validates, then inserts the raw input, so keys outside the template are stored
    (`libs/db-sqlite/src/lib/cards.ts:81-84`).
  - Web `addCards` and `updateCard` store the parsed value, which zod strips (`:127-128`, `:145-148`).
  - Desktop stores the raw content on all three paths (`crates/koloda/src/repo/cards.rs:233`, `:291`).
  - Audit probe: a stray key survived web `addCard` and was dropped by web `addCards`.
  - Unreachable from today's UI, which builds content from the template's fields (`add-card.tsx:29-32`).
- C13. Risk, Later: a failed reset shows nothing.
  Decision: fixed by item 14.
  - The reset mutation has no `onError`, and its `error` is never rendered (`card-details.tsx:27`, `:50-61`).
  - The query client has no global mutation handler (`app-providers.tsx:50-64`; `rg -n MutationCache libs apps`: no
    hit).
    Add, edit, and both deletes surface their errors.
- C14. Risk, Later: narrow screens overwrite the remembered view.
  Decision: fixed by item 15.
  - CARDS.md §Card Views (lines 174, 176): the chosen view is remembered while the app is open; narrow screens force
    the stack.
  - The narrow effect writes `"stack"` into the shared view atom (`libs/srs-react/src/lib/decks/deck-cards.tsx:24-26`).
    Widening the window keeps the stack, and the user's "table" choice is gone.
    On a narrow first render the table mounts once before the effect switches it.
- C15. Risk, Later: `markdownToHtml` returns unsanitized HTML without a DOM.
  Decision: fixed by item 16.
  - `libs/srs/src/lib/markdown.ts:37` returns `DOMPurify.sanitize(html, config)` when `DOMPurify.isSupported` is false.
    DOMPurify 3.4.16 returns its input unchanged then (`node_modules/dompurify/dist/purify.es.mjs:2333`).
  - Both callers render in the browser (`lesson-card-field-markdown.tsx:8`, `assistant-markdown.tsx:18`), so nothing
    reaches it today.
    The line reads as sanitizing and is the trap.
- C16. Improvement, Should-fix: the web card repo misses update, bulk-delete, and roundtrip tests.
  Decision: fixed by item 9.
  - `agents/TESTING.md` (Layers: every entity keeps a full-field roundtrip at the integration layer; the twin rule).
  - `rg -n 'updateCard\b|deleteCards?\b' libs/db-sqlite/src -g '*.test.ts'` finds only `deleteCard` in
    `referential-integrity.integration.test.ts:109`.
    No web test covers: an update changes content only and moves `updatedAt`; a missing template rejects with
    `not-found.cards.update.template`; a required field rejects; `deleteCards` removes only the selected cards and
    their reviews.
  - Rust has `delete_cards_removes_only_selected_cards`, `delete_cards_with_empty_ids_is_a_noop`
    (`cards_integration_tests.rs:495`, `:525`), and `add_card_round_trips_every_field` (`:38`).
  - The web reset test writes every column but asserts only the reset values (`cards.integration.test.ts:182-230`).
    So the web card has no roundtrip.
  - Rust tests `update_card` only through sync capture (`cards_sync_integration_tests.rs:91`).
    None asserts that deck, template, and scheduling stay unchanged, or the update not-found codes.
- C17. Improvement, Later: e2e gaps for desktop reset, the stack view, and pagination.
  Decision: fixed by item 20.
  - Web `card-edit.spec.ts:86` resets progress after a lesson.
    Desktop `card-edit.spec.ts` has only the edit and preview flows (`:10`, `:60`).
  - `rg -n -i 'stack|pagination' apps/web-e2e/src apps/electron-e2e/src` finds no card flow for the stack view or for
    page navigation, where C2 and C3 live.
- C18. Improvement, Later: preview copied the lesson's card-content build.
  Decision: fixed by `lessons-audit` item 6 (`29b4a052`, on `main`); nothing planned here.
  `card-preview-reducer.ts` now calls `createLessonCardForm` from the lesson reducer.
- C19. Improvement, Later: a table-column test cannot fail.
  Decision: fixed by item 17.
  - `agents/TESTING.md` (The survival question).
  - The test helper derives field ids from position, so both templates share ids (`cards-table-utility.test.ts:5-21`).
    "getFieldId returns correct field id for each template" (`:72`) passes even if `getFieldId` ignored its template.
    The mixed-template case (`:90`) has the same blind spot.
- C20. Improvement, Later: leftover surface and style residue.
  Decision: fixed by item 18.
  - Copy-pasted prop type names: `cards-stack.tsx:13` declares `CardsTableProps`; `delete-card.tsx:11` declares
    `DeleteDeckProps`.
  - `card-state.tsx:20` joins a value-dependent class with `.join(" ")`; `agents/CSS.md` (Decision flow) asks for
    `tv()`.
  - `cards-table-columns-visibility.tsx` has a generic `TData` and an optional `onColumnOrderChange?`.
    Its one caller always passes both (`cards-table.tsx:188-192`); see `agents/CODE-STYLE.md` (Change Discipline).
  - `card-details.tsx:75-76` reads `card?.createdAt` on a required prop.
  - The due filter casts a `Date` to `string | null` (`cards-table.tsx:92`).
  - The English delete prompt reads "all it's reviews" (`libs/srs-react/locales/en/messages.po:430`).
- C21. Product decision, Later: preview is unavailable in the stack view, and so on narrow screens.
  Decision: fixed by item 13; the card details view offers preview of the saved card (question 3).
  - CARDS.md §Card Preview (line 165): "The user can preview a card without saving any changes."
    §Card Views (line 176): narrow screens force the stack.
  - Preview is only a table row action (`cards-table-cell-preview-card.tsx`).
    The stack shows `CardDetails`, which has no preview (`card-details.tsx:138-150`).
- C22. Risk, Later, handed over: closing the add dialog mid-add drops the refresh.
  Decision: fixed by item 4.
  - `AddCard` passes its invalidations, form reset, and focus to `mutate` as per-call callbacks
    (`libs/srs-react/src/lib/cards/add-card.tsx:48-55`).
  - Closing the dialog calls the mutation's `reset()` (`:69-74`).
    In TanStack Query 5.90.9, `reset()` removes the observer from the mutation
    (`node_modules/@tanstack/query-core/build/modern/mutationObserver.js:50-55`).
    Per-call callbacks run only through an observer with listeners (`:75-77`).
    So an add that settles after the close leaves the deck's card list and lesson counts stale.
    Leaving the deck page mid-add unmounts `AddCard` (mounted in `deck-cards.tsx:35`), with the same result.
  - `onSubmit` does not await the add, so the form's submitting state ends at once.
    The Add button is gated only by `canSubmit` and `isDirty` (`add-card.tsx:130-136`), so a second Add can run while
    the first is pending.
    That is `decks.md` finding 6's shape, which that report lists for the deck, preset, and template dialogs only.
  - Awaiting the add fixes both: TanStack Form 1.25.0 keeps `canSubmit` false while submitting
    (`@tanstack/form-core/dist/esm/FormApi.js:776`), and `handleSubmit` returns early then (`:889`).

### Templates and decks

- T1. Spec violation, Must-fix: the template editor shows a stale lock status after cards change.
  Decision: fixed by item 2.
  - TEMPLATES.md §Locking (line 69): "The editor shows the current lock status."
    §Relationships (line 30): any card on the template locks it; deleting the last such card unlocks it.
  - The editor reads `isLocked` from the cached detail query (`libs/srs-react/src/lib/templates/template.tsx:22`).
    It gates the status line, the type and required controls, add and remove field, and delete (`:87-92`, `:99`,
    `:111`).
  - Lock is computed when the template is read (`libs/db-sqlite/src/lib/columns.ts:20-24`,
    `crates/koloda/src/repo/templates.rs:82-86`); only a refetch can change it.
  - `rg -n 'queryKeys\.templates' libs apps` finds no template invalidation in any path that adds or removes cards:
    - `add-card.tsx:50-51`, `delete-card.tsx:31-32`, `cards-table-cell-delete-card.tsx:35-36`, and
      `cards-table-selection-controls.tsx:41-42` invalidate only the deck's cards and the lessons;
    - the assistant's card save does the same (`libs/assistant-react/src/lib/ui/use-assistant-cards-table.tsx:149-150`
      at `b662537e`);
    - deck delete removes the deck's cards but invalidates only `templates.decksAll()`
      (`libs/srs-react/src/lib/decks/delete-deck.tsx:30-35`);
    - the desktop sync `cards` entry lists only card and lesson keys (`sync-events.ts:13`), against its INVARIANT
      (`:10-11`).
  - Queries stay fresh for 60 seconds (`app-providers.tsx:62`).
    The route loader's `ensureQueryData` returns cached data
    (`libs/app-react/src/lib/routes/_.templates.$templateId.tsx:14`).
  - Both lock specs reload before each lock assertion (`apps/web-e2e/src/template-lock.spec.ts:51`, `:70`;
    `apps/electron-e2e/src/template-lock.spec.ts:48`, `:67`).
    Without the reload, the flow they test is the one that fails.
  - Scenario: a new template gets its first card; within a minute the editor still says "Not locked".
    Removing a field and saving fails with "update-locked"; delete fails with "delete-locked".
    After deleting the last card, it still says "Locked" and delete stays disabled.
- D5. Risk, Should-fix: deck edit and delete leave Dashboard data stale.
  Decision: fixed by item 3.
  - The sync `decks` entry refreshes the deck lists, both usage prefixes, and the lesson keys (`sync-events.ts:8`,
    `:15`).
  - Edit (`libs/srs-react/src/lib/decks/deck-details.tsx:31-35`) refreshes decks and the two usage prefixes, but no
    lesson key.
    The lesson rows carry the deck title (web `libs/db-sqlite/src/lib/lessons.ts:51`, Rust
    `crates/koloda/src/repo/lessons.rs:62`), and the Dashboard shows it.
    The Dashboard loader returns cached data, and queries stay fresh for 60 seconds.
  - Delete (`delete-deck.tsx:30-35`) refreshes the lesson counts but not `todayReviewTotals()`.
    Both hosts delete the deck's reviews (web `libs/db-sqlite/src/lib/decks.ts:79` at `b662537e`, Rust
    `repo/decks.rs:258-264`).
  - Scenario: a renamed deck shows its old name on the Dashboard; a deleted deck studied today still counts in today's
    figures.

### Out

- The other findings of `templates.md` and `decks.md`, and the other audit reports.
  They are triaged separately; `tmp/audits/PROGRESS.md` holds their order.
- `hotkeys.md` findings 1, 8, and 14 (hotkey scopes are flags), for the hotkeys triage (question 1).
  Item 6 removes one symptom that finding 1 lists: the exiting pristine card form no longer saves on `Mod+S`.
  The `form` scope still switches off when two forms overlap; the hotkeys triage should record what item 6 closed.
- `host-desync.md` finding 2 (rows validated on read, and the error a bad row raises), for the host-desync triage
  (question 1).
  Item 10 closes the web write path that reached it; that triage should record it.
- The editor twins: `decks.md` findings 4 and 6, `algorithms.md` findings 6 and 11, `learning-settings.md` finding 2,
  and `media.md` findings 1 and 4.
  Item 4 closes add-card's pending-submit shape; that triage keeps only `media.md` finding 4's insertion block there.
- The other card paths with per-call `mutate` callbacks (update, reset, and the three deletes).
  None resets its mutation on close; they lose their refresh only if the deck page unmounts mid-write.
  Seen, not planned.
- Sync apply of card content from another device; item 11 changes only local writes.

## Open questions

- [x] 1. Task shape? — the rest of `cards.md`, with `templates.md` finding 1, `decks.md` finding 5, and the add-card
  handover (C22).
  `hotkeys.md` finding 1 and `host-desync.md` finding 2 stay with their own triages (human, 2026-10-25).
- [x] 2. C10: what does selection do under a search or filter? — it survives.
  The selection count and bulk delete cover only selected cards that match the search and filters.
  The template filter becomes a column filter, so every filter behaves the same (human, 2026-10-25).
- [x] 3. C21: preview on narrow screens? — the card details view offers preview of the saved card (human,
  2026-10-25).
- [x] 4. C12: unknown content keys? — dropped on both hosts on add, batch add, and update; no new error code (human,
  2026-10-25).
- [x] 5. Flow? — `local`, the default.
- [x] 6. Plan approved as written (human, 2026-10-25).

## Plan

`SR`, `SRS`, `UI`, `DB`, and `ER` below stand for
`bunx vitest run --config <dir>/vitest.config.mjs --configLoader runner`.
Their dirs are `libs/srs-react`, `libs/srs`, `libs/ui`, `libs/db-sqlite`, and `apps/electron-react`.
`RS` stands for `cargo test -p koloda`.
Line numbers are at `b662537e`; when an earlier item moved them, find the code by its text.

- [x] 1. Keep the cards table on a page that has rows
  Goal (C2):
  - `CardsTable` (`libs/srs-react/src/lib/cards/cards-table.tsx`):
    - set `pageIndex` to 0 when the search changes (`:197-200`, the clear button `:208-211`) or a filter changes (the
      `setFilters` passed to `CardsTableFilters`, `:187`);
    - clamp `pageIndex` to `max(0, table.getPageCount() - 1)` when the page count drops, which covers deletes and
      refetches.
  - WHY on `autoResetPageIndex: false` (`libs/ui/src/lib/primitives/table/table-features.ts:65`).
    Find why it is off before writing it (`git log -S autoResetPageIndex`).
    The audit's reading: a refetch after an edit must not jump back to page 1, so `CardsTable` clamps instead.
  - Tests in a new `cards-table.test.tsx`.
    Render the real `CardsTable` and `@koloda/ui` table, fed by a fake `queriesAtom` (cards, deck, template queries):
    - 40 cards, page size 15, on the last page, a search with 11 matches: 11 rows show, and the footer starts at 1;
    - 40 cards on the last page, then the list refetches with 20: the table moves to page 2 and shows cards 16-20.
  Constraints:
  - `cards-table.tsx`, the WHY in `table-features.ts`, and the new test.
  - The other tables keep their options.
  Done when:
  - `SR cards-table` passes;
  - both cases fail without the fix.
  Manual verify (web):
  - A deck with more than 30 cards → Cards → table → last page → search a word that matches fewer than 15 cards.
  - The matching rows show, and the footer starts at 1.
  - Clear the search → go to a last page that holds one card → delete it from its row → the previous page shows.
  Commit: Keep the cards table on a page that has rows
  Depends on: none

- [x] 2. Refresh template lock status after cards change
  Goal (T1):
  - Invalidate `queryKeys.templates.all()` on success in the six paths that add or remove cards:
    - `libs/srs-react/src/lib/cards/add-card.tsx:50-51`;
    - `delete-card.tsx:31-32`;
    - `cards-table-cell-delete-card.tsx:35-36`;
    - `cards-table-selection-controls.tsx:41-42`;
    - `libs/assistant-react/src/lib/ui/use-assistant-cards-table.tsx:149-150`;
    - `libs/srs-react/src/lib/decks/delete-deck.tsx:30-35`.
  - Desktop sync: add `queryKeys.templates.all()` to `SYNC_KIND_QUERY_KEYS.cards`
    (`apps/electron-react/src/app/sync-events.ts:13`), as its INVARIANT (`:10-11`) asks.
    Extend the `cards` case in `sync-events.test.ts` (`:41-56`): a template detail key is invalidated.
  - Remove the four `page.reload()` calls (`apps/web-e2e/src/template-lock.spec.ts:51`, `:70`;
    `apps/electron-e2e/src/template-lock.spec.ts:48`, `:67`).
    The lock specs then fail if a refresh regresses.
  Constraints:
  - Only these handlers and the sync entry; no other key changes.
  - The six handlers are wiring, with no unit test of their own (`agents/TESTING.md` §When tests are required).
    The lock specs are their regression home.
  - Do not run either e2e suite.
  - Implemented: both lock specs now wait for the delete popover to close before leaving the deck.
    It closes in the success handler, so the refresh has run; leaving earlier unmounts the row and drops it.
  Done when:
  - `ER sync-events` passes, and the extended case fails without the new key;
  - `nx run web-e2e:typecheck` and `nx run electron-e2e:typecheck` pass.
  Manual verify (web):
  - Add a template → a deck on it → open the template: "Not locked".
  - Add a card to the deck → open the template again within a minute: "Locked", and delete is disabled.
  - Delete that card → open the template: "Not locked", and delete is enabled.
  Commit: Refresh template lock status after cards change
  Depends on: none

- [x] 3. Refresh today's totals and deck titles after card and deck changes
  Goal (C9, D5):
  - Invalidate `queryKeys.lessons.todayReviewTotals()` on success in the five paths that delete reviews:
    - reset: `card-details.tsx:55-57`;
    - delete from details: `delete-card.tsx:31-32`;
    - delete from a row: `cards-table-cell-delete-card.tsx:35-36`;
    - bulk delete: `cards-table-selection-controls.tsx:41-42`;
    - deck delete: `libs/srs-react/src/lib/decks/delete-deck.tsx:30-35`.
  - Deck edit (`deck-details.tsx:31-35`): also invalidate `queryKeys.lessons.all()`, since the Dashboard rows show the
    deck title.
  Constraints:
  - Only these handlers; they keep their per-call `mutate` callbacks (Scope, Out).
  - Wiring, with no unit test of its own; item 20 adds the reset case to both e2e suites.
  Done when: `bun run typecheck` passes.
  Manual verify (web):
  - Study one new card of a deck → Dashboard: today's progress counts it.
  - That deck → Cards → edit the card → Reset progress → Dashboard: the count drops by one.
  - Study it again → delete the card → Dashboard: the count drops; the same after deleting a studied deck.
  - Rename a deck on its Details tab → Dashboard at once: the row shows the new name.
  Commit: Refresh today's totals and deck titles after card and deck changes
  Depends on: none

- [x] 4. Keep the add-card refresh when the dialog closes mid-add
  Goal (C22):
  - `AddCard` `onSubmit` (`add-card.tsx:47-56`): `await mutateAsync(value)` in a `try`/`catch`.
    On success, run the invalidations (with item 2's templates key), `formApi.reset()`, and the focus.
    The `catch` returns; the dialog keeps rendering the mutation `error` (`:128`).
  - WHY above it: closing the dialog calls the mutation's `reset()` (`:73`), which detaches the observer.
    TanStack drops per-call `mutate` callbacks then, and also when the deck page unmounts.
  - Awaiting also keeps the form submitting until the add settles, so Add and `Mod+E` cannot start a second add.
  - Tests in a new `add-card.test.tsx`, with a gated add promise:
    - submit, close the dialog, then resolve: the deck's cards, lessons, and templates queries are invalidated
      (spy on the `QueryClient`);
    - submit twice before the first add resolves: add runs once.
  Constraints:
  - `add-card.tsx` and its test.
  - The other card paths keep their per-call callbacks (Scope, Out).
  Done when:
  - `SR add-card` passes;
  - the close case fails on the per-call `mutate` code, and the double-submit case fails without the `await`.
  Manual verify (web):
  - A deck → Cards → add card → fill the fields → press Add and then Escape at once.
  - The deck's card list shows the new card without a reload.
  - Skip if: the add settles before Escape lands; the gated test forces that order.
  Commit: Keep the add-card refresh when the dialog closes mid-add
  Depends on: 2

- [x] 5. Keep the stack view on a card after a delete
  Goal (C3):
  - `CardsStack` (`cards-stack.tsx:22-23`): derive `position = Math.min(index, Math.max(cards.length - 1, 0))`.
    Use it for the card (`:23`, `:60`), the counter (`:50`), both button guards (`:34`, `:42`), and as the base for
    previous and next (`:35`, `:43`).
  - Test in a new `cards-stack.test.tsx`: 3 cards, move to the third, then the list refetches with 2.
    The second card's details show, the counter reads 2 / 2, and next is disabled.
  Constraints:
  - `cards-stack.tsx` and its test.
  - The keyed `Fade` that keeps two `CardDetails` mounted (`:59-61`) is `hotkeys.md` finding 1; leave it.
  Done when:
  - `SR cards-stack` passes;
  - the case fails without the clamp.
  Manual verify (web):
  - A deck with 3 cards → Cards → stack view → next twice → Delete → confirm.
  - The second card shows, and the counter reads 2 / 2.
  Commit: Keep the stack view on a card after a delete
  Depends on: none

- [x] 6. Save a form by hotkey only when it has changes
  Goal (C4):
  - `Controls` submit hotkey (`libs/ui/src/lib/primitives/form/form.tsx:129-135`): submit only when the form is dirty
    and can submit.
    That matches the Save button, which renders only while the form is dirty (`:162`).
  - All seven `Controls` forms get the rule (Scope, C4).
  - HOTKEYS.md §Forms, Save row (line 66): it does nothing while the form is unchanged or cannot be submitted.
  - Tests in a new `libs/ui/src/lib/primitives/form/form-controls.test.tsx`, on a form with `Controls`:
    - `Mod+S` while the form is unchanged does not call `onSubmit`;
    - after an edit, `Mod+S` calls it once.
  Constraints:
  - The submit hotkey and HOTKEYS.md line 66 only.
  - Discard (`:136-142`) already checks `isDirty`.
  - Scope ownership (`:124-127`) is `hotkeys.md` finding 1; leave it.
  - Implemented: the `libs/ui` test setup's `@koloda/core-react` mock had a stale `forms` key with no bindings.
    `Controls` reads `form`, so it could not render there; the mock now has `form` with `Mod+S` and `Mod+D`.
  Done when:
  - `UI form-controls` passes;
  - the unchanged case fails without the check;
  - `bun run check:markdown` passes.
  Manual verify (web):
  - A deck with a card never edited → Cards → stack view → `Mod+S` → no "Updated" time appears.
  - Edit its front → `Mod+S` → saved, and "Updated" shows.
  - Settings → Learning → `Mod+S` without changes → nothing happens.
  Commit: Save a form by hotkey only when it has changes
  Depends on: none

- [x] 7. Delete only the selected cards the table shows
  Goal (C10; question 2):
  - Take the bulk delete ids from `table.getFilteredSelectedRowModel()` (`cards-table.tsx:177`).
    The selection count and the delete then cover only selected cards that match the search and filters.
  - Template filter as a column filter: stop filtering `data` (`:146-150`).
    Add a `templateId` accessor column with `enableHiding: false` and `enableGlobalFilter: false`.
    Hide it through the initial column visibility, and add `filters.templateIds` to `columnFilters` (`:160-163`).
    The Columns menu skips columns that cannot hide (`cards-table-columns-visibility.tsx`, `getCanHide`).
  - CARDS.md §Table View, after line 192: selection survives search and filters.
    The selection count and bulk delete cover only the selected cards that match them.
  - Tests in `cards-table.test.tsx` (item 1):
    - 3 cards selected, then a search leaves 1: the count reads 1, and bulk delete sends 1 id;
    - cards on two templates, all selected, then the template filter hides one: it is not deleted.
      Before deleting, clear the filter: the hidden card shows as still selected.
  Constraints:
  - `cards-table.tsx`, its test, and CARDS.md.
  - Header select ("all cards on the current page") is unchanged.
  Done when:
  - `SR cards-table` passes;
  - the search case fails against `getSelectedRowModel`.
  Manual verify (web):
  - A deck with 3 cards → Cards → table → select all → search a word in one card → the selection bar shows 1.
  - Delete → confirm → clear the search → the other two cards remain.
  Commit: Delete only the selected cards the table shows
  Depends on: 1

- [ ] 8. Build the cards table columns and filter from the cards' templates
  Goal (C5):
  - `useCardsTemplates` (`use-cards-templates.ts:10-14`): add the deck's template only when there are no cards.
    An empty table then still has headers.
  - The headers (`cards-table-utility.ts:25-26`) and the Template filter's "more than one" check
    (`cards-table-filters.tsx:27`) then follow the cards.
  - Tests in `cards-table.test.tsx`:
    - every card on T1 (Front/Back) and the deck on T2 (Question/Answer): the headers read Front and Back, and the
      Filters popover has no Template section;
    - an empty deck on T2: the headers read Question and Answer.
  Constraints: `use-cards-templates.ts` and the test.
  Done when:
  - `SR cards-table` passes;
  - the first case fails while the deck's template is always added.
  Manual verify (web):
  - A deck with cards on the seeded template → Details → switch to a template whose field titles differ → Cards.
  - The headers keep their titles, and Filters has no Template section.
  - Add a card → the headers become positional (`#1`, `#2`), and the Template filter appears.
  Commit: Build the cards table columns and filter from the cards' templates
  Depends on: 1

- [ ] 9. Test web card updates, bulk delete, and a full-field roundtrip
  Goal (C16):
  - `libs/db-sqlite/src/lib/cards.integration.test.ts`:
    - a full-field roundtrip: add a card with every insert field set, read it back, compare field by field
      (twin of `add_card_round_trips_every_field`, `cards_integration_tests.rs:38`);
    - an `updateCard` table:
      - content changes, while deck, template, and scheduling stay, and `updatedAt` moves;
      - a missing card rejects with `not-found.cards.update.card`;
      - a card whose template is gone rejects with `not-found.cards.update.template`;
      - an empty required field rejects with `validation.cards.content.field-empty`;
    - `deleteCards` removes only the selected cards and their reviews, and empty ids are a no-op (twins of `:495`,
      `:525`).
  - `crates/koloda/tests/integration/cards_integration_tests.rs`:
    - `update_card` with a missing card and with a missing template asserts the two not-found codes;
    - an update leaves deck, template, and scheduling unchanged.
  - Both hosts turn foreign keys on, and `cards.template_id` references templates
    (`crates/koloda/src/migrations/V1__init.sql:27`).
    Build the template-less card with foreign keys off in the fixture.
  Constraints: tests only; no repo code changes.
  Done when: `DB cards` and `RS card` pass.
  Manual verify: none — tests only.
  Commit: Test web card updates, bulk delete, and a full-field roundtrip
  Depends on: none

- [ ] 10. Validate progress fields on web card insert
  Goal (C11, and C12's web `addCard` half):
  - `getInsertCardSchema` (`libs/srs/src/lib/cards.ts:80-83`): re-apply `refineCardProgress`.
    Spreading `insertCardSchema.shape` drops its `superRefine` (`:85`).
  - `addCard` (`libs/db-sqlite/src/lib/cards.ts:81-84`): insert the parsed value, as `addCards` does (`:127-128`).
  - Twin of `add_card_rejects_invalid_progress_state` (`cards_integration_tests.rs:120`) in
    `cards.integration.test.ts`:
    - `addCard` with `state: 999` rejects with `validation.cards-progress.state`, and no row is stored;
    - `addCards` with `reps: -1` reports `validation.cards-progress.reps` for that item, and no row is stored.
  - A case that `addCard` does not store a content key outside the template.
  Constraints: `libs/srs` and `libs/db-sqlite` `cards.ts`, and the test; `insertCardSchema` is unchanged.
  Done when:
  - `DB cards` and `SRS cards` pass;
  - the new cases fail without the refine and the parsed insert.
  Manual verify: none — no UI path sends progress fields; the add form, the assistant batch, and the web seed send
  defaults.
  Commit: Validate progress fields on web card insert
  Depends on: 9

- [ ] 11. Keep only template fields in stored card content
  Goal (C12; question 4):
  - Rule on both hosts: a content key that is not a field of the card's template is dropped on add, batch add, and
    update.
  - Web: item 10 covers `addCard`; `addCards` and `updateCard` already store the parsed value
    (`libs/db-sqlite/src/lib/cards.ts:127-128`, `:145-148`).
  - Desktop: `insert_card_data` (`crates/koloda/src/repo/cards.rs:229-233`) and `update_card` (`:288-291`) store only
    the template's field keys.
    Put the filter in the domain beside `validate_content` (`crates/koloda/src/domain/cards.rs:256-279`).
    Give it a twin comment naming the zod strip.
    Compare the filtered content in the capture check (`repo/cards.rs:308`).
  - CARDS.md §Card Content, after line 44: values for keys that are not fields of the template are not stored.
  - Twin cases: a stray key is not stored after add, batch add, and update, in `cards.integration.test.ts` and
    `cards_integration_tests.rs`.
  Constraints:
  - Sync apply of content from another device is out of scope.
  - No new error code.
  Done when:
  - `DB cards` and `RS card` pass;
  - the Rust cases fail without the filter.
  Manual verify: none — no UI path sends keys outside the template.
  Commit: Keep only template fields in stored card content
  Depends on: 10

- [ ] 12. Submit a card preview with Enter or Space, as in a lesson
  Goal (C6):
  - `CardPreview` (`libs/srs-react/src/lib/cards/card-preview.tsx`):
    - Enter and Space submit while the preview is open and focus is not in a text field.
      Register them as `lesson-studying.tsx:28` does (`conflictBehavior: "allow"`).
    - "Continue" is focused when the card appears and has no first input field, as `lesson-footer.tsx:37-41` does.
  - Register the keys only while the preview is open.
    `CardPreview` is mounted for every table row with `isOpen` false (`cards-table-cell-preview-card.tsx:24`).
    Use the `""` scope: `grades` is the lesson's scope, turned on by the lesson session (`use-lesson-session.ts:147`).
  - Tests in a new `card-preview.test.tsx`:
    - a card with no type field, open in preview: Space submits, so the reveal field shows and "Continue" goes away;
    - a card with a type field: Space typed in it inserts a space and does not submit.
  Constraints:
  - `card-preview.tsx` and its test.
  - `Mod+E` stays where HOTKEYS.md (line 75) lists it.
  Done when:
  - `SR card-preview` passes;
  - the Space case fails without the binding.
  Manual verify (web):
  - A template with Front on display and Back on reveal → a deck on it with one card → Cards → table → preview.
  - "Continue" has focus → press Space → Back appears.
  - Preview a card whose template has a type field → type in it → Space adds a space.
  Commit: Submit a card preview with Enter or Space, as in a lesson
  Depends on: none

- [ ] 13. Offer preview from the card details view
  Goal (C21; question 3):
  - `CardDetails` actions (`card-details.tsx:138-150`): a Preview button beside Reset and Delete.
    It opens `CardPreview` for the saved card with its own template (`card.templateId`).
    The stack view, which narrow screens force, and the table's edit dialog then offer preview.
  - Label it with the existing `preview-card.trigger` key; no new catalog key.
  - CARDS.md §Card Preview (line 165): the user can preview a card from the table or from the card details view.
  Constraints:
  - `card-details.tsx` and CARDS.md; the table's row action stays.
  - Wiring of the existing preview, with no unit test of its own; item 12 tests preview behavior.
  Done when:
  - `SR` passes, and `bun run typecheck` passes;
  - `bun run check:markdown` passes.
  Manual verify (web):
  - A narrow window → a deck → Cards (stack) → Preview → the card shows as in a lesson → Escape → the same card.
  - A wide window → table → Edit card → Preview → the preview opens over the edit dialog.
  Commit: Offer preview from the card details view
  Depends on: 12

- [ ] 14. Show a failed progress reset
  Goal (C13):
  - Render `resetProgressMutation.error` beside the reset action (`card-details.tsx:50-61`, `:141-146`).
    Use `ErrorMessage` with `formatAppError(error, _, ERROR_MESSAGES["db.update"])`, as `DeleteCard` does
    (`delete-card.tsx:45`).
  - Test in a new `card-details.test.tsx`: the reset rejects with `AppError("not-found.cards.reset.card")`.
    The translated message shows next to the action.
  Constraints: `card-details.tsx` and its test.
  Done when:
  - `SR card-details` passes;
  - the case fails without the error render.
  Manual verify: none — a reset fails only if the card disappears mid-action; the component case forces it.
  Commit: Show a failed progress reset
  Depends on: 13

- [ ] 15. Keep the chosen card view across narrow screens
  Goal (C14):
  - `DeckCards` (`libs/srs-react/src/lib/decks/deck-cards.tsx:24-26`): drop the effect that writes `"stack"` into
    `cardsViewAtom`.
    Render `isMobile ? "stack" : view` instead.
  - Test in a new `deck-cards.test.tsx`, with a controllable `matchMedia`: the view is "table".
    A narrow width renders the stack.
    A wide width again renders the table, and the atom still reads "table".
  Constraints: `deck-cards.tsx` and its test.
  Done when:
  - `SR deck-cards` passes;
  - the case fails with the effect.
  Manual verify (web):
  - A deck → Cards → table → narrow the window below the wide breakpoint → stack.
  - Widen it again → table.
  Commit: Keep the chosen card view across narrow screens
  Depends on: none

- [ ] 16. Refuse to render markdown without a DOM
  Goal (C15):
  - `markdownToHtml` (`libs/srs/src/lib/markdown.ts:37`): throw when `DOMPurify.isSupported` is false.
  - WHY on the throw: DOMPurify returns its input unchanged without a DOM.
    Both callers render in the browser, so a missing DOM is a wiring bug, not a fallback.
  - Case in `markdown.test.ts`: with `DOMPurify.isSupported` set false for that case and restored after,
    `markdownToHtml` throws.
  Constraints: `markdown.ts` and its test.
  Done when:
  - `SRS markdown` passes;
  - the case fails on the old line.
  Manual verify: none — the browser paths are unchanged.
  Commit: Refuse to render markdown without a DOM
  Depends on: none

- [ ] 17. Give the column utility test distinct field ids per template
  Goal (C19):
  - `cards-table-utility.test.ts:5-21`: derive field ids from the template id, so two templates never share ids.
  - Rewrite "getFieldId returns correct field id for each template" (`:72`) and the mixed case (`:90`).
    Each asserts that every template resolves its own id at the same position.
  Constraints: the test file only.
  Done when:
  - `SR cards-table-utility` passes;
  - the `:72` case fails if `getFieldId` ignores its template argument.
  Manual verify: none — tests only.
  Commit: Give the column utility test distinct field ids per template
  Depends on: none

- [ ] 18. Clean up card view residue
  Goal (C20):
  - `cards-stack.tsx:13`: rename `CardsTableProps` to `CardsStackProps`.
  - `delete-card.tsx:11`: rename `DeleteDeckProps` to `DeleteCardProps`.
  - `card-state.tsx:20`: build the class with `tv()`, per `agents/CSS.md` (Decision flow).
  - `cards-table-columns-visibility.tsx`: drop the generic `TData`, and make `onColumnOrderChange` required.
  - `card-details.tsx:75-76`: read `card.createdAt` and `card.updatedAt` without `?.`.
  - The due filter (`cards-table.tsx:92`): read the value as `Card["dueAt"]` and drop the cast.
  - `libs/srs-react/locales/en/messages.po:430`: "Delete this card with all its reviews?".
    Extract and compile both apps per `agents/I18N.md`; the Russian text is unchanged.
  Constraints: no behavior change except the English prompt.
  Done when: `SR` and `bun run typecheck` pass.
  Manual verify (web):
  - A deck → Cards → Delete card on a row → the prompt reads "Delete this card with all its reviews?".
  Commit: Clean up card view residue
  Depends on: 5, 7, 14

- [ ] 19. Match CARDS.md to the card views and keep one home per rule
  Goal (C7, C8) in CARDS.md:
  - §Table View (line 181): rows show content, state, and due time.
    The creation and update columns start hidden, and the Columns menu shows them.
  - §Editing Cards (line 120): the details view always shows the creation time and a delete action.
    The update time shows once the content has been edited.
  - History removal: §Review History (line 138) owns it.
    §Deleting Cards (line 145) and §Resetting Progress (line 156) drop their copies or point there.
  - Deck membership: §Relationships (line 27) owns it; drop the deck half of §What it is (line 16).
  - Template lock pointer: §Relationships (line 36) owns it; drop §Card Content's copy (lines 49-50).
  Constraints:
  - CARDS.md only, with no change in meaning.
  - Items 7, 11, and 13 edit other lines of this file; keep their text.
  Done when:
  - `bun run check:markdown` passes;
  - every `§` pointer names an existing heading.
  Manual verify: none — spec only.
  Commit: Match CARDS.md to the card views and keep one home per rule
  Depends on: 7, 11, 13

- [ ] 20. Cover card reset, table paging, and stack delete in both e2e suites
  Goal (C17, and the reset half of C9):
  - Port the web reset flow (`apps/web-e2e/src/card-edit.spec.ts:86`) to `apps/electron-e2e/src/card-edit.spec.ts`.
    In both copies, check today's progress on the Dashboard before and after the reset.
    It counts the card's review before, and not after (C9, item 3).
  - `cards-table.spec.ts` on both hosts: with more than one page of cards, go to page 2.
    Search a term that matches fewer than a page: the matching rows show (C2, item 1).
  - `card-delete.spec.ts` on both hosts: in the stack view, move to the last card and delete it.
    The previous card shows, and the counter reads the new total (C3, item 5).
  - Keep the two suites step for step; put shared steps in `libs/e2e` only if its README says so.
  Constraints:
  - Do not run either suite (`agents/VERIFY.md`).
  - Typecheck only: `nx run web-e2e:typecheck` and `nx run electron-e2e:typecheck`.
  Done when: both typechecks pass.
  Manual verify: the human runs `card-edit`, `cards-table`, `card-delete`, and `template-lock` on both hosts.
  Commit: Cover card reset, table paging, and stack delete in both e2e suites
  Depends on: 1, 3, 5

## Outcome

<what shipped>
