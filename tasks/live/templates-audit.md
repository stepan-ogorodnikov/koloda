# Templates audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, docs/specs/TEMPLATES.md, agents/RUST.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/VERIFY.md, agents/I18N.md, agents/BACKWARDS-COMPATIBILITY.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/MARKDOWN.md, apps/web-e2e/README.md, apps/electron-e2e/README.md, libs/e2e/README.md, agents/REVIEW.md
Flow: local

## Intent

Settle every finding of the templates audit as one task.

- The audit covered the behavior owned by `docs/specs/TEMPLATES.md`.
  That is template structure, fields, layout, locking, adding, cloning, editing, and deleting.
  The audit report (`templates.md` in the audit series) was written at `d32fb02e` (`main`).
- Its finding 1 was fixed by `tasks/archive/cards-audit.md` (item 2, `439c1cf2`).
  It is recorded here, not planned.

This file restates every finding and its evidence, so neither the next session nor the archive reader needs the report.

Triage checked each finding again at `248e44b1`, where this task branches.
Since `d32fb02e`, the template code changed only under the cards and decks tasks:

- card add, card delete (three sites), the assistant card save, deck delete, and the desktop sync `cards` entry
  refresh the template queries (cards item 2);
- `add-template.tsx` and `clone-template.tsx` await the write (decks item 2);
- the template editor keeps synced values in untouched groups and lost its mount-only reset (decks items 4 and 5);
- TEMPLATES.md says some characters count as two toward the title and notes limits (decks item 10).

The domain on both hosts, both template repos, their tests, and the other template e2e specs are unchanged.
Every remaining finding holds; only `template.tsx` line numbers moved.
The audit wrote no probes.
Line numbers below are at `248e44b1`.

The report's verdict: the domain and both repos are in good shape.
Zod and the Rust validator agree on every content rule and error code, and each mirrored rule carries a twin comment.
Delete runs its three guards in one transaction on both hosts.
The main defect was the stale lock status in the UI cache (T1, fixed).
The rest is a write race, a host difference in the list, test gaps, and editor polish.

Done when, in user-visible terms:

- a card that lands while a template is being saved cannot leave a locked template without one of its fields;
- the template list reports the same lock on both hosts;
- a rejected locked save shows one translated message, the same on both hosts;
- the editor keeps one layout item per field, and both hosts reject a template that breaks that;
- new templates get their own field ids and field titles in the interface language;
- the last field cannot be removed;
- each field and layout row's controls name their row for assistive technology;
- TEMPLATES.md has one home per rule;
- the template repos and the Rust validator tests check outcomes and codes on both hosts;
- the lock e2e flows cover the locked editor, notes, and clone of a locked template;
- `bun run check:push` passes on the tip, and every plan item is one commit with a `Task:` trailer.

## Scope

Entries use the report's numbers with the prefix `T`.
T15 was added at triage.

### Spec violations

- T1. Spec violation, Must-fix: the editor showed a stale lock status after cards changed.
  Decision: fixed by `cards-audit` item 2 (`439c1cf2`, on `main`); nothing planned here.
  - Card add, the three card delete paths, the assistant card save, and deck delete invalidate
    `queryKeys.templates.all()`.
    The desktop sync `cards` entry lists it (`apps/electron-react/src/app/sync-events.ts:13`).
  - Both lock e2e specs dropped their `page.reload()` calls, so they fail if the refresh regresses.
- T2. Spec violation, Later: §Layout says each item chooses its field; the editor ties items to fields.
  Decision: fixed by item 7; one layout item per field (question 2).
  - TEMPLATES.md §Layout (line 49): "Each item chooses a field and an operation".
    Line 62: "A template must keep at least one layout item."
    §Fields (line 42) says removing a field removes "every layout item" that pointed at it, so a field may have more
    than one.
  - A layout row shows its field as a read-only, disabled text box
    (`libs/srs-react/src/lib/templates/template-layout.tsx:44-54`).
    There is no control to add, remove, or retarget a layout item.
  - An item is created only by add-field (`template-fields.tsx:65-68`) and leaves only with its field (`:50-56`).
    So the editor keeps exactly one item per field.
    The layout minimum can only be reached by removing the last field.
  - Both validators accept two items for one field, and duplicate field ids (`libs/srs/src/lib/templates.ts:24-60`,
    `crates/koloda/src/domain/templates.rs:120-173`).
    The editor keys layout rows by field id and field rows by id (`template-layout.tsx:42`, `template-fields.tsx:44`).
    A template with either shape renders with colliding React keys and drag ids.
  - Every writer today goes through the editor or the seed, so the shape needs hand-crafted input.
- T3. Spec hygiene, Later: TEMPLATES.md restates its own and a sibling's rules.
  Decision: fixed by item 6.
  - `agents/FUNCTIONAL-SPECIFICATIONS.md` (One home per rule).
  - §Relationships line 28 ("A deck has a current template used when adding cards manually") restates DECKS.md
    (lines 15, 21) and CARDS.md §Relationships.
    Line 29 already points at CARDS.md.
  - The minimum counts appear three times: §Relationships (lines 26-27), §Fields (line 44), §Layout (lines 62-63).
  - The lock definition appears twice: line 30 and lines 67-68.
  - §Editing Templates line 129 restates the §Locking list (lines 75-79).
  - Not a finding: the title rule, the notes rule, and the add-dialog success link repeat in DECKS.md and
    ALGORITHMS.md on purpose (FUNCTIONAL-SPECIFICATIONS.md, the stated exception).

### Risks

- T4. Risk, Should-fix: the locked-field check runs outside the write transaction on both hosts.
  Decision: fixed by item 1; no interleaving test (see item 1).
  - Web `updateTemplate` reads the template and its lock (`libs/db-sqlite/src/lib/templates.ts:79`), validates
    (`:82-85`), then runs the `UPDATE` as a separate call (`:87`).
    There is no transaction.
  - Rust `update_template` reads through `get_template` (`with_conn`, `crates/koloda/src/repo/templates.rs:228`),
    validates (`:234-238`), and only then opens `with_transaction` (`:245`).
  - The delete twin moved its guards into the transaction, with a WHY that names this race
    (`libs/db-sqlite/src/lib/templates.ts:112-114`, `repo/templates.rs:314`).
  - On desktop, renderer calls share one FIFO worker.
    The sync host queues on a second worker (`apps/electron/src-rust/src/lib.rs:133-139`) and holds its own handle on
    the same database (`sync.rs:142`).
    So a remote card can be applied between the read and the write.
    On the web, an assistant card insert can run at the `await` between the read and the write.
  - Scenario: template T has no cards.
    The user removes a field and saves.
    Meanwhile a card for T arrives: synced from another device, or saved from the assistant's card table.
    The save passes the unlocked check, then writes.
    T is now locked, and it lacks a field that its card holds content for.
- T5. Risk, Should-fix: the web template list reports every template unlocked.
  Decision: fixed by item 2.
  - Web `getTemplates` selects `TEMPLATE_SELECT` without `TEMPLATE_LOCKED_SELECT`
    (`libs/db-sqlite/src/lib/templates.ts:24`).
    `templateRowSchema` then fills `isLocked: false` (`libs/srs/src/lib/templates.ts:69-72`).
  - Rust `get_templates` computes the lock for every row (`crates/koloda/src/repo/templates.rs:53-57`).
    So `getTemplatesQuery` returns different `isLocked` values for the same data on the two hosts.
  - The WHY on the default says "List/insert returning rows omit isLocked".
    The insert half is false: both hosts return the inserted row through the lock-aware single read (web
    `templates.ts:69`, Rust `:150`).
  - No reader uses the list's `isLocked` today (`rg -n 'isLocked' libs apps` finds the detail editor and fixtures).
    The `Template` type promises the field, so the next reader gets a host-dependent answer.
  - No test on either host lists a locked template.
- T6. Risk, Later: new templates reuse the seeded template's field ids.
  Decision: fixed by item 8.
  - `DEFAULT_TEMPLATE` uses `SEED_TEMPLATE_TYPE_FRONT_FIELD_ID` and `SEED_TEMPLATE_TYPE_BACK_FIELD_ID`
    (`libs/srs/src/lib/templates.ts:89-101`).
    `libs/app/src/lib/seed-ids.ts:1` describes these as ids for seeded fields.
  - The add dialog starts from that object unchanged (`libs/srs-react/src/lib/templates/add-template.tsx:34`).
    So every template the user adds has the same two field ids as the seeded template and every other added one.
  - `DEFAULT_TEMPLATE_FIELD` carries the same front id as a placeholder (`templates.ts:103-108`).
    Its only caller overwrites it (`template-fields.tsx:66-67`).
  - Today ids only have to be unique within one template, so nothing breaks.
    But a card looked up against the wrong template matches silently instead of showing missing fields.
    Any future cross-template field lookup inherits the collision.
  - Triage: minting ids in `defaultValues` is not enough.
    After a successful add, `formApi.reset()` restores the same default values, so a second add from the same dialog
    would reuse the first one's ids.
- T7. Risk, Later: the locked-save error details differ by host.
  Decision: fixed by item 3; no details on either host, and a message that says what is rejected (question 4).
  - TS collects every violation as English text with raw field ids (`libs/srs/src/lib/templates.ts:127-155`).
    The web repo joins them into the error details (`libs/db-sqlite/src/lib/templates.ts:83-84`).
  - Rust returns at the first violation with different wording (`crates/koloda/src/domain/templates.rs:175-205`).
  - The form shows details under the translated message (`libs/ui/src/lib/primitives/form/form.tsx:77`).
    So the same rejected save shows different, untranslated, uuid-bearing text on each host.
  - The message itself says only "Cannot update locked template" (`libs/app/locales/en/messages.po:729-730`).

### Improvements

- T8. Improvement, Should-fix: the template repos miss the roundtrip, notes, clone, and unlock cases.
  Decision: fixed by item 4; the TS locked-field twins move to item 3.
  - `agents/TESTING.md` §Layers: "Every entity keeps at least one full-field roundtrip at the integration layer."
    Also §The TS ↔ Rust twin rule.
  - `libs/db-sqlite/src/lib/templates.integration.test.ts` has 9 tests and no roundtrip.
    No web template test writes notes (`rg -n -l notes libs/db-sqlite/src --glob '*.test.ts'` finds only the
    algorithms file).
    Rust has the roundtrip (`crates/koloda/tests/integration/templates_integration_tests.rs:13-51`).
  - Clone is untested at the repo level on both hosts.
    The only Rust clone test checks the sync outbox (`templates_sync_integration_tests.rs:9-46`).
    No test checks that a clone copies fields and layout, drops notes, and starts unlocked when the source is locked
    (§Cloning Templates).
  - Unlocking when the last card is deleted (§Relationships, line 30) is untested on both hosts.
    The web test covers only locking (`templates.integration.test.ts:25-38`).
  - Twin gaps in `validateLockedTemplateFields`: Rust pins the required-flag change and adding a field to a locked
    template (`crates/koloda/tests/domain/templates_update_tests.rs:82`, `:131`).
    The TS tests cover neither (`libs/srs/src/lib/templates.test.ts:24-43`).
    The web repo tests a type change only, not a removed field.
  - `templates.integration.test.ts:165-178` asserts `.rejects.toThrow()` with no code.
    It re-tests the `libs/srs` layout refine through the repo without a WHY (§One home per behavior).
- T9. Improvement, Should-fix: one Rust template test cannot fail; the rest are per-cell.
  Decision: fixed by item 5; the locked-update code assertions move to item 3.
  - `test_empty_fields_fails` (`crates/koloda/tests/domain/templates_insert_tests.rs:25-38`) sends no fields and a
    layout item that points at a field.
    If the too-few check were removed, layout membership would still reject it, and the test asserts only `is_err()`.
    So nothing on the Rust side protects "at least one field".
    The TS twin asserts the code (`templates.test.ts:79-93`).
  - Per-cell tests: field types (`:188-221`) and operations (`:260-312`).
  - Duplicate pairs, one without a code and one with: `:224` and `:518`, `:314` and `:540`, `:332` and `:562`.
  - A serde battery (banned in `TESTING.md` §Banned patterns): `:57-108`, `:170`, `:414-516`, and
    `templates_update_tests.rs:156-237`.
    `templates_serde_tests.rs:81-104` already holds a shape test for `InsertTemplateData`.
  - The locked-update tests assert `is_err()` without the `update-locked` code (`templates_update_tests.rs:35-105`).
- T10. Improvement, Later: e2e gaps: the locked editor, notes, clone details.
  Decision: fixed by item 13.
  - Evidence: the seven template specs per host (`template-add`, `-clone`, `-delete`, `-edit`, `-lock`, `-reorder`,
    `-reset`).
  - No spec opens a locked template's editor and checks the disabled type and required controls, the hidden add and
    remove, the editable operations, or the disabled delete (§Locking, §Editing Templates).
  - No spec edits notes.
  - The clone spec does not clone a locked or noted source (§Cloning Templates).
  - No spec checks that add-field adds a "display" layout item (§Fields).
    The reset spec counts layout rows only after Discard.
  - The desktop lock spec clicks Save without waiting for it to finish
    (`apps/electron-e2e/src/template-lock.spec.ts:25`).
    The web twin waits (`apps/web-e2e/src/template-lock.spec.ts:24-28`).
- T11. Improvement, Later: every field row's controls have the same accessible names.
  Decision: fixed by item 11; the row's position names it (question 5).
  - Each row labels its inputs "Title", "Type", and "Required", with no field identity
    (`libs/srs-react/src/lib/templates/template-fields-item.tsx:19`, `:33`, `:62-64`).
  - The template's own title is also "Title" (`template.tsx:80`).
  - A screen-reader user cannot tell which field a control edits.
  - The e2e specs pick the template title and the fields by position (`apps/web-e2e/src/template-edit.spec.ts:23`,
    `:34`).
- T12. Improvement, Later: the last field can be removed, and the save then fails.
  Decision: fixed by item 10.
  - Remove-field shows on every row while the template is unlocked (`template-fields-item.tsx:68-76`).
  - Removing the last field also empties the layout (`template-fields.tsx:50-56`).
    Save then shows two errors, too-few fields and too-few layout items.
  - §Fields (line 44): a template must keep at least one field.
- T13. Improvement, Later: leftover residue.
  Decision: fixed by item 12.
  - `isDisabled={isLocked ?? undefined}` on a non-optional boolean (`template-fields-item.tsx:35`).
  - `!!(data?.length && data.length > 0)` (`delete-template.tsx:45`).
  - `getTemplateDecksQuery` takes `DeleteDeckData` (`libs/core-react/src/lib/queries.ts:89`;
    `apps/web/src/app/queries.ts:159`; `apps/electron-react/src/app/queries.ts:142`).
    Web `getTemplateDecks` takes `DeleteTemplateData` (`libs/db-sqlite/src/lib/templates.ts:133`).
    Both are an `{ id }` of a template.
  - `insertTemplateSchema` accepts `notes` (`libs/srs/src/lib/templates.ts:117`), which both hosts drop.
    The Rust `InsertTemplateData` has no such field.
    `insertDeckSchema` (`libs/srs/src/lib/decks.ts:22`) and `insertAlgorithmSchema`
    (`libs/srs/src/lib/algorithms.ts:24`) share the pattern; their Rust twins have no notes either.

### Product decisions

- T14. Product decision, Later: new templates always get English field titles.
  Decision: fixed by item 9; default field titles follow the interface language (question 3).
  - `DEFAULT_TEMPLATE` names its fields "Front" and "Back" as plain strings (`libs/srs/src/lib/templates.ts:93-94`).
    §Adding Templates quotes the same words (line 90).
  - Every template added in the Russian UI, and the desktop's starter template, get English field titles.
    The desktop's starter title is localized (`apps/electron-react/src/app/setup.ts:18-24`).
    The web's Russian seed localizes both: "Лицо" and "Оборот" (`apps/web/src/app/seed/ru/templates/type.json:8`,
    `:14`).

### Added at triage

- T15. Improvement, Later: every layout row's controls have the same accessible names too.
  Decision: fixed by item 11, with T11.
  - Each layout row labels its field box "Field" and its operation select "Operation"
    (`template-layout.tsx:45`, `:58`).
  - Same defect as T11, on the same screen.

### Out

- `host-desync.md` finding 2 also asks for a Rust twin of the web template-delete case over a corrupt learning row
  (`templates.integration.test.ts:138-151`).
  It stays with the host-desync triage.
- Template sync capture and apply (audited in `sync-repo-audit`), how lessons render fields (LESSONS.md), how a deck
  picks its template (DECKS.md), and what the assistant reads from templates: owned by their own reports.
- Already reported elsewhere, not repeated by the audit: lesson data cached after a layout edit (`lessons.md`
  finding 1), a markdown "type" item taking the focus target (`lessons.md` finding 5), the form Submit hotkey saving
  an unedited form (`cards.md` finding 4), lessons rendering a card with its deck's template (`cards.md` finding 1).
  All four landed with the lessons and cards tasks.

## Open questions

- [x] 1. Task shape? — the templates report alone; no other report's finding pairs with it now.
  `local` flow, the default.
- [x] 2. T2: are layout items bound to their field? — yes, one item per field.
  §Layout says so, and both validators reject duplicate field ids and a second item for one field (human, 2026-10-28).
- [x] 3. T14: do default field titles follow the interface language? — yes, at creation, in the add dialog and the
  desktop starter template; existing templates are not touched (human, 2026-10-28).
- [x] 4. T7: how do the hosts converge on the locked-save error? — no details on either host.
  The en and ru message says what a locked save rejects (human, 2026-10-28).
- [x] 5. T11: what names a row? — its position, e.g. "Field 2 title" (human, 2026-10-28).
- [x] 6. New user-visible copy (items 3, 7, 9, 11) is drafted in each item; edit it at approval if needed — as
  drafted, except item 3's ru message, which the human shortened (2026-10-28).
- [x] 7. Plan approved with that edit (human, 2026-10-28).

## Plan

`SRS`, `SR`, `APP`, and `DB` below stand for `bunx vitest run --config <dir>/vitest.config.mjs --configLoader runner`.
Their dirs are `libs/srs`, `libs/srs-react`, `libs/app`, and `libs/db-sqlite`.
`RS` stands for `cargo test -p koloda`.
"Both compiles" are `nx run @koloda/web:lingui-compile` and `nx run @koloda/electron-react:lingui-compile`, each after
its extract (`agents/I18N.md`).
Line numbers are at `248e44b1`; when an earlier item moved them, find the code by its text.

- [x] 1. Check a template's lock inside the update transaction
  Goal (T4):
  - Web `updateTemplate` (`libs/db-sqlite/src/lib/templates.ts:75-99`): run the read, the lock check, the `UPDATE`,
    and the returning read inside one `db.transaction`, as `deleteTemplate` does (`:110-131`).
    Add a WHY that points at the delete twin.
  - Rust `update_template` (`crates/koloda/src/repo/templates.rs:226-292`): read the template, its lock, and its
    stored values inside the existing `with_transaction`, before the `UPDATE`.
    Validation that needs the lock (`data.values.validate(Some(&original.content))`) runs there too.
    Share the row SQL with `get_template` through a connection-level helper; do not copy the query.
    The not-found case keeps its code `not-found.templates.update.template`.
  - Same WHY on both hosts, each naming the other as its twin.
  Constraints: the two repo functions; no domain or UI change.
  No interleaving test: neither repo has a seam between its read and its write, and adding one only for a test is
  not worth it (the delete twin has none either).
  The existing locked-update and not-found tests keep the behavior pinned.
  Done when: `DB templates` and `RS template` pass.
  Manual verify: none — the race needs a card to land mid-save; behavior without a race is unchanged.
  Commit: Check a template's lock inside the update transaction
  Depends on: none

- [x] 2. Report the real lock in the web template list
  Goal (T5):
  - Web `getTemplates` (`libs/db-sqlite/src/lib/templates.ts:22-27`): select `TEMPLATE_LOCKED_SELECT` too.
  - `templateRowSchema` (`libs/srs/src/lib/templates.ts:69-72`): drop `.default(false)` and its WHY, so a row
    without the field fails to parse instead of reading as unlocked.
  - Tests, twins: web and Rust each list one template with a card and one without, and assert `isLocked` per row.
    Rust has no list test today; add it to `templates_integration_tests.rs`.
  Constraints: the list query, the row schema, and fixtures that build a `Template` without `isLocked` (typecheck
  finds them).
  Done when: `DB templates`, `SRS templates`, `RS template`, and `bun run typecheck` pass; the web list test fails
  with the old query.
  Manual verify: none — no screen reads the list's lock today.
  Commit: Report the real lock in the web template list
  Depends on: none

- [x] 3. Reject a locked-template save the same way on both hosts
  Goal (T7, T8's TS twins, T9's locked-update codes):
  - TS `validateLockedTemplateFields` (`libs/srs/src/lib/templates.ts:127-155`): return whether the update keeps every
    original field with its type and required flag; drop the English error list.
  - Web `updateTemplate`: throw `validation.templates.update-locked` with no details.
  - Rust `validate_locked_template_fields` (`crates/koloda/src/domain/templates.rs:175-205`): return the same code
    with no details.
  - Message (`libs/app/locales/{en,ru}/messages.po`, `validation.templates.update-locked`):
    en "Cards use this template, so its fields can't be removed or change type or required";
    ru "Шаблон используется карточками: поля нельзя удалять, менять тип или обязательность".
  - TS tests (`libs/srs/src/lib/templates.test.ts:24-43`): one table over title change (allowed), removed field,
    type change, required change (rejected), and an added field (allowed).
    Each row names its Rust twin in `templates_update_tests.rs`.
  - Rust tests (`templates_update_tests.rs:35-131`): each rejection asserts `VALIDATION_TEMPLATES_UPDATE_LOCKED` and
    no details.
  - Web: add a removed-field rejection next to the type-change case (`templates.integration.test.ts:65-96`); assert
    the code and that the stored template keeps the field.
  Constraints: the validator, the web repo call site, the Rust validator, both catalogs, and their tests.
  Done when: `SRS templates`, `DB templates`, `RS template`, `APP`, both compiles, and `bun run typecheck` pass.
  Manual verify: none — the editor hides the controls a locked save rejects, so the message shows only after a race
  (item 1) or on an editor opened before the first card landed elsewhere.
  Commit: Reject a locked-template save the same way on both hosts
  Depends on: 1

- [x] 4. Cover template roundtrip, clone, and unlock on both hosts
  Goal (T8):
  - Web full-field roundtrip in `templates.integration.test.ts`: update title, notes, fields, and layout, read back,
    and compare field by field, as the Rust twin does (`templates_integration_tests.rs:13-51`).
  - Clone, per host: a locked source with notes; the clone has the source's fields and layout, no notes, a new id,
    and `isLocked` false.
  - Unlock after delete, per host: a template with one card is locked; after the card is deleted it is not.
  - Delete the web "rejects adding a template whose layout references an unknown field" case (`:165-178`); the
    `libs/srs` refine owns it (`templates.test.ts:60`).
  Constraints: test files only.
  Done when: `DB templates` and `RS template` pass; the clone test fails if clone copied notes or the lock.
  Manual verify: none — tests only.
  Commit: Cover template roundtrip, clone, and unlock on both hosts
  Depends on: none

- [x] 5. Assert codes in the Rust template validator tests and table them
  Goal (T9):
  - `templates_insert_tests.rs`: one table of accepted field types and operations; one reject table over a shared
    valid baseline, each row with its error code (shape: `crates/koloda/tests/domain/reviews_validation_tests.rs`).
    The too-few-fields row asserts `VALIDATION_TEMPLATES_FIELDS_TOO_FEW`.
    Without that check, membership would report `layout.missing-field`, so the row fails if the check is removed.
  - Delete the replaced per-cell tests and the no-code duplicates (`:224`/`:518`, `:314`/`:540`, `:332`/`:562`) in
    the same commit.
  - Delete the serde battery (`templates_insert_tests.rs:57-108`, `:170`, `:414-516`;
    `templates_update_tests.rs:156-237`).
    Keep `test_insert_template_data_input_shapes` (`templates_serde_tests.rs:81-104`) and add one table-driven shape
    test for `UpdateTemplateData` beside it: `id` and `values` required, `notes` optional.
  - Keep the uuid-shape cases (`:373`, `:395`) as rows; they pin the check order the TS twin matches.
  Constraints: Rust test files only.
  Done when: `RS --test domain template` passes; no reject row asserts only `is_err()`.
  Manual verify: none — tests only.
  Commit: Assert codes in the Rust template validator tests and table them
  Depends on: 3

- [x] 6. Give each template rule one home in TEMPLATES.md
  Goal (T3):
  - Minimum counts and layout membership live in §Relationships; drop them from §Fields (line 44) and §Layout
    (lines 62-63).
  - The lock definition lives in §Locking; §Relationships (line 30) points at it.
  - Drop line 28 (the deck's current template); line 29's CARDS.md pointer stays, and DECKS.md owns the rule.
  - §Editing Templates (lines 127-129) says only what the editor shows; it points at §Locking for what stays editable.
  Constraints: `docs/specs/TEMPLATES.md` only; no behavior change; keep the title, notes, and success-link rules the
  three sibling specs repeat on purpose.
  Done when: `bun run check:markdown` passes, and each rule above appears once.
  Manual verify: none — spec text only.
  Commit: Give each template rule one home in TEMPLATES.md
  Depends on: none

- [x] 7. Keep one layout item per template field
  Goal (T2):
  - TEMPLATES.md: each field has exactly one layout item.
    Adding a field adds its item with **display**; removing a field removes its item.
    The user changes an item's operation and position, not its field.
    Put the rule in §Relationships (item 6 made it the home); fix §Fields line 42 ("every layout item").
  - Both validators reject two fields with one id and two layout items for one field, with new codes
    `validation.templates.fields.duplicate-id` and `validation.templates.layout.duplicate-field`.
    Zod: in the existing `superRefine` (`libs/srs/src/lib/templates.ts:48-60`); Rust: in `validate_template_content`
    (`crates/koloda/src/domain/templates.rs:120-173`).
    Order on both: field duplicates, then per layout item membership, then its duplicate; the first error matches.
  - Codes: `error_codes` (`crates/koloda/src/app/error.rs`), `ErrorCode` and `ERROR_MESSAGES`
    (`libs/app/src/lib/error.ts`).
    Messages: en "Every field needs its own id" and "Each field can have only one layout item";
    ru "У каждого поля должен быть свой id" and "У каждого поля может быть только один элемент раскладки".
  - Twin tests: TS rows in `templates.test.ts`, Rust rows in item 5's reject table.
  Constraints: spec, both validators, error codes and catalogs, their tests; the editor already keeps the rule.
  Done when: `SRS templates`, `RS template`, `APP error-parity`, both compiles, and `bun run check:markdown` pass.
  Manual verify: none — the editor cannot build the rejected shapes.
  Commit: Keep one layout item per template field
  Depends on: 5, 6

- [x] 8. Give each new template its own field ids
  Goal (T6):
  - `AddTemplate` (`libs/srs-react/src/lib/templates/add-template.tsx:41-54`): mint a fresh id per field at submit,
    and remap the layout to them.
    Do not mint in `defaultValues`: `formApi.reset()` after a success restores them, so a second add would reuse ids.
  - `DEFAULT_TEMPLATE` keeps the seed ids; the desktop starter template uses them
    (`apps/electron-react/src/app/setup.ts:18-24`).
  - `DEFAULT_TEMPLATE_FIELD` (`libs/srs/src/lib/templates.ts:103-108`): drop the placeholder id (type it without
    `id`), or inline the object at its one caller (`template-fields.tsx:66-67`).
  - Test (`SR`): two adds from one open dialog send templates whose field ids differ from each other and from the seed
    ids, with each layout item pointing at its own template's field.
    Follow `libs/srs-react/src/lib/components/entity-add-dialogs.test.tsx`.
  Constraints: the add dialog, the default field constant, and the test.
  Done when: `SR add-template` (or the dialogs test) and `bun run typecheck` pass; the test fails with the old dialog.
  Manual verify: none — field ids are not shown.
  Commit: Give each new template its own field ids
  Depends on: none

- [x] 9. Title a new template's default fields in the interface language
  Goal (T14):
  - `libs/srs`: export the two default field titles as `msg` descriptors next to `DEFAULT_TEMPLATE`, like
    `TEMPLATE_FIELD_TYPES_MESSAGES` (`libs/srs/src/lib/templates.ts:13-16`).
    en "Front" and "Back"; ru "Лицо" and "Оборот", as the web Russian seed.
  - `AddTemplate` titles the fields with them when it builds the new template (item 8's submit step).
  - The desktop starter (`starterContent`, `apps/electron-react/src/app/setup.ts:18-24`) titles its fields with them.
  - TEMPLATES.md §Adding Templates (line 90): the default fields are titled in the interface language at creation;
    a later language change does not rename them.
  - Test: extend item 8's test.
    Activate a catalog that maps the two ids to "Лицо" and "Оборот"; the sent fields carry those titles.
    The `srs-react` tests activate `en` with no messages (`entity-add-dialogs.test.tsx:20`), so the catalog is
    the test's own.
  Constraints: `libs/srs` constants, the add dialog, the desktop starter, the spec, catalogs.
  Done when: `SR`, both compiles, `bun run typecheck`, and `bun run check:markdown` pass.
  Manual verify:
  - Host: web; desktop for the starter.
  - Settings → Language → Russian → Templates → New template → add → open it → fields are "Лицо" and "Оборот".
  - Desktop, fresh profile, Russian at setup → Templates → the starter's fields are "Лицо" and "Оборот".
  Commit: Title a new template's default fields in the interface language
  Depends on: 8

- [ ] 10. Hide remove-field on a template's last field
  Goal (T12):
  - `TemplateFields` (`libs/srs-react/src/lib/templates/template-fields.tsx`) passes whether the row may be removed;
    `TemplateFieldsItem` (`template-fields-item.tsx:68-76`) hides the button when the template is locked or only one
    field is left.
  - TEMPLATES.md §Editing Templates: remove-field is hidden while only one field is left.
  Constraints: the two components and the spec.
  The flow is covered by item 13's e2e step, not a unit test (`agents/TESTING.md`, no unit test that shadows e2e).
  Done when: `bun run typecheck`, `bun run lint`, and `bun run check:markdown` pass.
  Manual verify:
  - Host: web.
  - Templates → a template with no cards → remove fields until one is left → its remove button is gone.
  - Add a field → both rows show remove again.
  Commit: Hide remove-field on a template's last field
  Depends on: 6

- [ ] 11. Name each template row's controls by their position
  Goal (T11, T15):
  - Field rows (`template-fields-item.tsx:19`, `:33`, `:62-64`): "Field {0} title", "Field {0} type",
    "Field {0} required"; ru "Название поля {0}", "Тип поля {0}", "Обязательное поле {0}".
    The checkbox keeps its visible "Required" text; the accessible name contains it.
  - Layout rows (`template-layout.tsx:45`, `:58`): "Layout item {0} field", "Layout item {0} operation"; ru
    "Поле элемента раскладки {0}", "Действие элемента раскладки {0}".
  - Position is the row's 1-based index.
    Follow the step amount labels, whose message id takes the position
    (`libs/srs-react/src/lib/algorithms/algorithm-learning-steps.tsx:31-32`).
    Drop the old ids from the `srs-react` catalogs.
  - e2e, both hosts: the `template-*` specs pick field and layout controls by these names, not by "Title" or "Field"
    plus `.first()` or `.last()`.
    The template title becomes the only exact "Title" in the form.
  Constraints: the two row components, the `srs-react` catalogs, both apps' compiled catalogs, and the template
  e2e specs on both hosts.
  Done when: both compiles, `bun run typecheck`, `nx run web-e2e:typecheck`, and `nx run electron-e2e:typecheck` pass.
  The e2e specs are typechecked only; the human runs both suites.
  Manual verify:
  - Host: web.
  - Templates → a template → with a screen reader, or the browser's accessibility tree, focus the second field's
    type → it reads "Field 2 type".
  Commit: Name each template row's controls by their position
  Depends on: none

- [ ] 12. Drop template residue and notes from the insert schemas
  Goal (T13):
  - `template-fields-item.tsx:35`: `isDisabled={isLocked}`.
  - `delete-template.tsx:45`: `(data?.length ?? 0) > 0` or equivalent, without the double check.
  - `getTemplateDecksQuery` takes a template id type (`DeleteTemplateData` or `Pick<Template, "id">`) in
    `libs/core-react/src/lib/queries.ts:89` and both hosts' queries (web `:159`, desktop `:142`).
  - Omit `notes` from `insertTemplateSchema`, `insertDeckSchema`, and `insertAlgorithmSchema` in one change; both hosts
    already drop it, and the Rust insert DTOs have no notes.
    Fix every caller the typecheck flags; clones keep dropping the source's notes.
  Constraints: the listed files and the callers typecheck finds; no behavior change.
  Done when: `bun run typecheck`, `bun run lint`, `SRS`, `DB`, and `SR` pass.
  Manual verify: none — no behavior change.
  Commit: Drop template residue and notes from the insert schemas
  Depends on: none

- [ ] 13. Cover the locked editor, notes, and locked clone in the template e2e flows
  Goal (T10):
  - `template-lock`, both hosts, after the card locks the template:
    the type and required controls are disabled; add-field and remove-field are hidden; an operation can be changed;
    delete is disabled.
    Edit notes, save, and see them after leaving and coming back.
    Clone the locked template; the clone shows "Not locked", the same fields, and empty notes.
  - Desktop `template-lock`: wait for Save to finish, as the web twin does
    (`apps/web-e2e/src/template-lock.spec.ts:24-28`).
  - `template-edit`, both hosts: add-field adds a layout row with **Display**; with one field left, it has no remove
    button (item 10).
  - Use item 11's names.
  Constraints: the template e2e specs on both hosts, and `libs/e2e` only if a step is shared by both.
  Done when: `nx run web-e2e:typecheck` and `nx run electron-e2e:typecheck` pass.
  The cases are typechecked only; the human runs both suites.
  Manual verify: none — this item is the e2e coverage; run `template-lock` and `template-edit` on both hosts.
  Commit: Cover the locked editor, notes, and locked clone in the template e2e flows
  Depends on: 10, 11

## Outcome

<what shipped>
