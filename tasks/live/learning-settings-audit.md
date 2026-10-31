# Learning settings audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, docs/specs/LEARNING-SETTINGS.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/CSS.md, agents/I18N.md, agents/RUST.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/MARKDOWN.md, agents/VERIFY.md, apps/web-e2e/README.md, apps/electron-e2e/README.md, libs/e2e/README.md, agents/REVIEW.md
Flow: local

## Intent

Settle every finding of the learning settings audit as one task.

- The audit covered the behavior owned by `docs/specs/LEARNING-SETTINGS.md`.
  That is learning defaults, daily limits, the learning-day boundary and how today's totals count, learn-ahead
  bounds, and the learning settings screen.
  The audit report (`learning-settings.md` in the audit series) was written at `d32fb02e` (`main`).
- Its finding 2 was fixed by `tasks/archive/decks-audit.md` (`8ea0c2df`).
  It is recorded here, not planned.

This file restates every finding and its evidence, so neither the next session nor the archive reader needs the report.

Triage checked each finding again at `36f894a4`, where this task branches.
Since `d32fb02e`, the learning settings code changed only under other audit tasks:

- the form keeps synced values in untouched sync groups through `useRefreshPristineFields` (decks-audit, `8ea0c2df`);
- Learn's first-setup cap is unlimited (lessons-audit, `68ee9a25`);
- the learning e2e flow turns Learn's Unlimited off before typing a cap, since Learn now loads as unlimited.

The domain on both hosts, both repos, the totals queries, and their tests are unchanged.
Every remaining finding holds; only the form's line numbers moved.
Line numbers below are at `36f894a4`.

The report's verdict: the domain is in very good shape.
TypeScript and Rust agree on every default, shorthand, bound, and error order.
The learning-day window agrees across DST, and both sides pin it with a dedicated suite.
Today's totals use the same SQL filters and the same over-limit policy, with matching tests.
The defects are at the edges: the cache after a save, a desktop save racing sync (fixed), and the TS tests.

Done when, in user-visible terms:

- a saved limit or day start shows on the Dashboard at once, and the next lesson's default amounts use it;
- both hosts report a bad learn-ahead bound or default id with the same translated message;
- turning Unlimited off never sets a cap to a hard zero the user did not type;
- each Unlimited and counts-towards-total switch names its cap for assistive technology;
- LEARNING-SETTINGS.md has one home per rule;
- the TS validator tests fail when their rule is deleted, and both totals tests cover ignored and relearning reviews;
- the learning e2e flows check a successful save, persistence across a reload, and the Dashboard after a save;
- `bun run check:push` passes on the tip, and every plan item is one commit with a `Task:` trailer.

## Scope

Entries use the report's numbers with the prefix `LS`.

### Spec violations

- LS1. Spec violation, Must-fix: saving learning settings leaves today's totals stale.
  Decision: fixed by item 1.
  - LEARNING-SETTINGS.md §What it is (line 19): settings "take effect for later study".
    §Learning Day (line 105): "Changing Day starts at immediately changes which reviews fall into 'today'."
  - On success the form invalidates and sets only `queryKeys.settings.detail("learning")`
    (`libs/settings-react/src/lib/settings-learning.tsx:82-86`).
  - Today's totals are a separate query, `queryKeys.lessons.todayReviewTotals()` (`["today_review_totals"]`,
    `libs/core-react/src/lib/query-keys.ts:48`).
    Both hosts compute them from the stored day start and daily limits, and the result carries the limits
    (`libs/srs/src/lib/reviews.ts:109-154`, `crates/koloda/src/repo/reviews.rs:164-182`).
  - Two screens read that query: the Dashboard widget (`libs/srs-react/src/lib/components/learned-today.tsx:47-49`),
    which shows each limit and its over-limit state, and lesson init (`use-lesson-session.ts:45`), which takes
    `dailyLimits` and `reviewTotals` from it (`lesson-reducer.ts:176-182`) and computes default amounts from those.
  - Queries stay fresh for 60 seconds, and a mounted `useQuery` does not refetch when its data turns stale.
    The WHY in `libs/app-react/src/lib/app-providers.tsx:56-61` says the design depends on every mutation
    invalidating the queries it affects.
  - The desktop sync `settings.learning` entry already invalidates the totals
    (`apps/electron-react/src/app/sync-events.ts:8`).
    Card delete, deck delete, and lesson close do too; the local learning save is the one write path that does not.
  - Scenario: the user opens the Dashboard, lowers New from 50 to 10, and saves within a minute.
    Back on the Dashboard, New still shows 50, and a New lesson opened now defaults to up to 50 cards.
    Moving the day start from 05:00 to 12:00 at 10:00 leaves today's counts on the old window the same way.

### Risks

- LS2. Risk, Should-fix: on desktop, an edited settings form wrote back keys that sync had just changed.
  Decision: fixed by `decks-audit` (`8ea0c2df`, on `main`); nothing planned here.
  - Each learning key is its own sync group, and Rust captures only keys that differ from the stored document
    (`crates/koloda/src/repo/settings.rs`).
    TanStack Form adopts new defaults only while the whole form is untouched, so a key the user never touched kept its
    old value and was captured as a fresh write.
  - The form now calls `useRefreshPristineFields(form, initialValues, LEARNING_SYNC_GROUPS)`
    (`settings-learning.tsx:22-29`, `:94`): an untouched group takes the synced value live.
    SYNC.md (§Status) says an open edit form keeps the user's changes and its other fields take synced
    values.
  - The report's alternative (patch only changed keys) was not taken, so LEARNING-SETTINGS.md line 125 keeps "Save
    persists the whole settings payload"; LS9 handles its wording.
- LS3. Risk, Later: the TS validator lacks the codes Rust returns for learn-ahead bounds and default ids.
  Decision: fixed by item 3.
  - Rust returns `validation.settings-learning.learn-ahead-limit.hours-range`, `…minutes-range`,
    `validation.settings-learning.defaults.algorithm`, and `…defaults.template`
    (`crates/koloda/src/domain/settings_learning.rs:60-66`, `:323-337`).
    All four have `en` and `ru` text (`libs/app/src/lib/error.ts:61-65`).
  - TS validates the same rules with Zod's default messages: `z.uuid()` and `z.int().min(0).max(48)` /
    `.max(59)` in both schemas (`libs/app/src/lib/settings-learning.ts:133-134`, `:138`, `:143-144`, `:148`).
    An audit probe got "Too big: expected number to be <=48", "… <=59", and "Invalid UUID"; none is an
    `ERROR_MESSAGES` key, so the form would show the generic "An error occurred".
  - Unreachable through the UI today: the learn-ahead fields clamp to 0–48 and 0–59, and the pickers offer only ids.
    The day-start and exceeds-total rules already carry their codes in TS.

### Improvements

- LS4. Improvement, Should-fix: two TS "exceeds total" tests pass with their rule deleted, and none asserts the code.
  Decision: fixed by item 2.
  - TESTING.md §The survival question; §Write tests for ("Error paths: assert the exact error code").
  - `rejects untouched.value > total when counts is true` (`libs/app/src/lib/settings-learning.test.ts:212-221`) sets
    Total 10 and New 20, and leaves Review at its default {200, counts}, which also exceeds Total.
    An audit probe saw both `untouched-exceeds-total` and `review-exceeds-total`, so the case passes without the New
    rule.
  - `rejects learn.value > total when counts is true` (`:235-245`) leaves New at its default {50, counts}; the probe
    saw `untouched-exceeds-total` too.
  - All six "rejects/allows … total" cases (`:212-282`) check only `success`.
  - The Rust twins set every other cap under Total and assert each code
    (`crates/koloda/tests/domain/settings_learning_tests.rs:339-400`).
- LS5. Improvement, Later: test gaps and test residue around totals and the form.
  Decision: fixed by items 4 and 9, except the desktop repo clock (skipped).
  - The web totals test has no ignored review
    (`libs/db-sqlite/src/lib/settings-reviews.integration.test.ts:238-333`).
    The Rust twin has one (`crates/koloda/tests/integration/reviews_integration_tests.rs:86-105`).
    LEARNING-SETTINGS.md line 95 excludes ignored reviews.
  - Neither host tests that relearning (state 3) counts as Learn (line 99); both totals tests use states 0–2 only.
  - `expect(boundary.getHours()).toBe(5)` asserts the test's own fixture (`settings-reviews.integration.test.ts:332`,
    and its earlier twin in the same case).
  - `test_calculate_todays_review_totals_returns_daily_limits_unchanged` is a passthrough test
    (`crates/koloda/tests/domain/reviews_totals_tests.rs:50-67`).
  - Skipped: the desktop today-totals test reads the real clock (`reviews_integration_tests.rs:13-15`, `:108-139`),
    because `get_todays_review_totals` calls `Local::now()` (`crates/koloda/src/domain/learning_day.rs:43`).
    The window is pinned at the domain level by 20 Rust and 11 TS DST cases; adding a clock seam to the repo only for
    this test is not worth it.
  - e2e "Validation 4" resets Review "so it doesn't block the save", but New is still 50 over a Total of 5, so Save
    stays disabled; the case checks only that the Learn message is absent
    (`apps/web-e2e/src/settings-learning-form.spec.ts:66-78`, desktop twin `:63-73`).
  - `settings.spec.ts` "changes learning defaults and verifies persistence after navigation" (web `:45`, desktop
    `:43`) changes only limits and learn-ahead, and checks persistence by navigating inside the app, which reads the
    query cache, not the database.
  - No e2e test changes the day start or checks that saved limits reach the Dashboard (LS1).
- LS6. Improvement, Later: turning Unlimited off on a cap that loaded as unlimited sets a hard zero.
  Decision: fixed by item 5; the cap starts from its first-setup number, and Learn from 200 (question 2).
  - `DailyLimitCapField` remembers the last number it saw, starting from `value ?? 0` (`settings-learning.tsx:39`),
    and turning Unlimited off writes that number (`:58`).
  - §Daily Limits (lines 67-70) defines 0 as a hard cap with no room.
    For Total, a counted New of 50 then blocks the save with "New can't be more than total", though the user typed no 0.
  - Since lessons-audit, Learn loads as unlimited on every fresh install, so every user who turns it off hits this.
  - The component test covers only a cap that started as a number
    (`libs/settings-react/src/lib/settings-learning.test.tsx:6-20`).
- LS7. Improvement, Later: repeated controls share one accessible name.
  Decision: fixed by item 6; switches named by their cap.
  - Each of the four caps has a switch named "Unlimited" (`settings-learning.tsx:58-61`).
    Each of the three types has a switch named "Counts towards total" (`:151-154`, `:171-174`, `:191-194`).
    A screen reader cannot tell them apart, and both e2e suites pick them by position (`.first()`, `.nth(1)`,
    `.nth(2)`; web `settings-learning-form.spec.ts:23-24`, `:128`; desktop `:24-25`, `:122`).
  - The three type rows (`:138-197`) are copies that differ only in field and label.
- LS8. Improvement, Later: residue in the learning settings code.
  Decision: fixed by item 7.
  - `LearningSettingsInput` is used only by its alias `LearningSettings`
    (`libs/app/src/lib/settings-learning.ts:151-152`).
    `LearningSettings` is the exported name, used by `native-ipc`, `srs-react`, and `db-sqlite` tests.
  - `LearningDailyLimitType` is exported and unused (`:39`).
    Search: `git grep -n "LearningDailyLimitType" -- libs apps` finds only its definition.
  - The same normalized content is parsed three times: in the route
    (`libs/app-react/src/lib/routes/_.settings.learning.tsx:37`), in the component on every render
    (`settings-learning.tsx:73`), and on reset (`:85`).
  - `formApi.reset(returning?.content ? … : undefined)` (`:85`) guards a case neither host produces.
    If it ran, a bare reset would restore the values from before the save (the deck editor's WHY,
    `libs/srs-react/src/lib/decks/deck-details.tsx`, says the same).
  - `getCurrentLearningDayRange` is `async` with no `await` (`libs/srs/src/lib/reviews.ts:91-93`), so its one caller
    (`libs/db-sqlite/src/lib/reviews.ts:52`) and its tests await a plain value.
- LS9. Spec hygiene, Later: LEARNING-SETTINGS.md restates rules.
  Decision: fixed by item 8.
  - FUNCTIONAL-SPECIFICATIONS.md (§Principles, One home per rule; §Core model): the glossary is not a recap.
  - "Each cap is unlimited or a non-negative number" is in the glossary (line 25) and §Daily Limits (line 55).
  - "Defaults do not rewrite existing decks or cards" (§Relationships, line 36) restates §Defaults line 43.
  - "Types that do not count toward Total leave Total room unused when those defaults are computed" (line 86)
    restates LESSONS.md (§Default Amounts), which owns default amounts.
  - "Save persists the whole settings payload" (line 125) describes the write, not what the user sees.
    With LS2 fixed, what the user sees is SYNC.md's open-form rule.

### Product decisions

The report raised none.
The default Learn cap was `lessons.md` finding 17, settled by lessons-audit.

## Open questions

- [x] 1. Task shape? — the learning settings report alone.
  LS2 shipped with decks-audit.
  `interface-settings.md` finding 5 (web `patchSettings` outside a transaction) does not touch this form's save,
  which uses `setSettingsMutation`; it stays with the interface settings triage.
- [x] 2. LS6: what number does a cap start from when Unlimited turns off? — its first-setup number: Total 200, New 50,
  Review 200; Learn, which has none, takes 200 (human, 2026-10-31).
- [x] 3. LS5 e2e: does an e2e flow check that a new day start moves today's counts? — no.
  Which reviews fall in the window depends on the wall clock, so such a flow would be flaky near the boundary;
  the window is pinned by the domain DST suites.
  The new flow checks that the day start is saved and survives a reload, and that a saved limit reaches the Dashboard.
- [x] 4. New user-visible copy in item 6 is drafted there; edit it at approval if needed — as drafted.
- [x] 5. Plan approved (human, 2026-10-31).

## Plan

`APP`, `SRS`, `SET`, and `DB` below stand for `bunx vitest run --config <dir>/vitest.config.mjs --configLoader runner`.
Their dirs are `libs/app`, `libs/srs`, `libs/settings-react`, and `libs/db-sqlite`.
`RS` stands for `cargo test -p koloda`.
"Both compiles" are `nx run @koloda/web:lingui-compile` and `nx run @koloda/electron-react:lingui-compile`, each after
its extract (`agents/I18N.md`).
Line numbers are at `36f894a4`; when an earlier item moved them, find the code by its text.

- [x] 1. Refresh today's totals when learning settings save
  Goal (LS1):
  - In the save's `onSuccess` (`libs/settings-react/src/lib/settings-learning.tsx:82-86`), also invalidate
    `queryKeys.lessons.todayReviewTotals()`.
    Add a WHY: the totals carry the daily limits and the day window, as the desktop sync `settings.learning` entry
    does (`apps/electron-react/src/app/sync-events.ts:8`).
  - Add a `SettingsLearning` component test in `settings-learning.test.tsx`: render the form with a stub
    `setSettingsMutation` and a real `QueryClient` that holds a totals entry, change a limit, save, and assert the
    totals query is invalidated.
    The test fails if the invalidation is removed.
  Constraints: `settings-learning.tsx` and its test; no domain or repo change.
  Done when: `SET settings-learning` passes; `bun run typecheck` passes.
  Manual verify:
  - Host: web.
  - Dashboard → Settings → Learning → set New to 10 → Save → Dashboard within a minute → New shows a limit of 10.
  Commit: Refresh today's totals when learning settings save
  Depends on: none

- [x] 2. Pin each TS exceeds-total rule with its own code
  Goal (LS4):
  - Replace the six "rejects/allows … total" cases (`libs/app/src/lib/settings-learning.test.ts:212-282`) with one
    `it.each` table over New, Learn, and Review.
    Every row sets Total 10 and every other cap to 10 or below with counts on, so only the row's cap can break the rule.
  - Rejecting rows assert `issues.map((issue) => issue.message)` equals exactly the one expected
    `validation.settings-learning.daily-limits.<type>-exceeds-total` code.
    Allowing rows (counts off) assert success.
  - Keep the "equal to total" and "unlimited per-type" cases; drop any the table now covers.
  Constraints: the TS test file only; mirror the Rust table (`settings_learning_tests.rs:339-400`); no source change.
  Done when: `APP settings-learning` passes, and deleting any one of the three refines in
  `withCountedLimitRefines` makes exactly its rows fail (check by hand, then restore).
  Manual verify: none — test-only.
  Commit: Pin each TS exceeds-total rule with its own code
  Depends on: none

- [ ] 3. Report learn-ahead bounds and default ids with the Rust codes in TS
  Goal (LS3):
  - In both `learningSettingsValidation` and `resolvedLearningSettingsValidation`
    (`libs/app/src/lib/settings-learning.ts:131-149`), give the hours bound the message
    `validation.settings-learning.learn-ahead-limit.hours-range`, the minutes bound `…minutes-range`, and the two ids
    `validation.settings-learning.defaults.algorithm` and `…defaults.template`.
    Share one learn-ahead tuple and one defaults object between the two schemas, so the codes are written once; the
    defaulting schema adds `.default([0, 30])` on top.
    Each carries a twin comment naming the Rust validator (`settings_learning.rs:60-66`, `:323-337`).
  - Tests in `settings-learning.test.ts`: hours 49 and -1, minutes 60, and a non-uuid algorithm and template each
    assert the exact code, on both schemas.
  Constraints: `settings-learning.ts` and its test; the codes already have `en` and `ru` text, so no catalog change.
  Done when: `APP settings-learning` passes; `bun run typecheck` passes.
  Manual verify: none — the UI clamps these fields, so the codes are unreachable from the form today.
  Commit: Report learn-ahead bounds and default ids with the Rust codes in TS
  Depends on: 2

- [ ] 4. Cover ignored and relearning reviews in today's totals on both hosts
  Goal (LS5, unit part):
  - Web, `libs/db-sqlite/src/lib/settings-reviews.integration.test.ts` "calculates today's review totals using the
    learning day boundary and counts flags" (`:238`): add an ignored review inside the window and a relearning
    (state 3) review; assert the ignored one is not counted and the relearning one counts as Learn.
    Drop the `boundary.getHours()` assertions on the fixture (`:332` and its twin).
  - Rust, `crates/koloda/tests/integration/reviews_integration_tests.rs`
    `get_review_totals_counts_states_and_ignores_ignored_rows` (`:86-105`): add a state 3 row; Learn becomes 2,
    Total 4.
  - Rust: delete `test_calculate_todays_review_totals_returns_daily_limits_unchanged`
    (`crates/koloda/tests/domain/reviews_totals_tests.rs:50-67`), a passthrough.
  Constraints: test files only; the desktop repo clock stays as is (LS5 skip).
  Done when: `DB settings-reviews`, `RS --test integration reviews`, and `RS --test domain reviews_totals` pass.
  Manual verify: none — test-only.
  Commit: Cover ignored and relearning reviews in today's totals on both hosts
  Depends on: none

- [ ] 5. Start a cap from its first-setup number when Unlimited turns off
  Goal (LS6):
  - `DailyLimitCapField` (`settings-learning.tsx:31-64`) takes the number to use when a cap loaded as unlimited is
    turned on again: Total 200, New 50, Review 200, Learn 200.
    Take Total, New, and Review from the first-setup defaults in `@koloda/app` (`settings-learning.ts:122-129`)
    rather than repeating the numbers; Learn has no default number, so its 200 is a named constant with a WHY
    (it does not count toward Total on first setup, so 200 never blocks a save).
  - A cap that loaded as a number keeps restoring its last number, as today.
  - Component tests: a cap loaded as unlimited writes its fallback when Unlimited turns off; the existing
    last-number case stays.
  Constraints: `settings-learning.tsx` and its test; no schema change; LEARNING-SETTINGS.md §Daily Limits gains one
  sentence: turning off Unlimited on a cap that had no number fills in the first-setup number, and Learn takes 200.
  Done when: `SET settings-learning` passes; `bun run typecheck` passes.
  Manual verify:
  - Host: web.
  - Settings → Learning → turn off Learn's Unlimited → Learn shows 200 → Save succeeds.
  Commit: Start a daily cap from its first-setup number when Unlimited turns off
  Depends on: 1

- [ ] 6. Name each daily-limit switch by its cap
  Goal (LS7):
  - Render the New, Learn, and Review rows (`settings-learning.tsx:138-197`) from one component that takes the type,
    so their fields, labels, and names stay in step.
  - Accessible names (the visible text stays "Unlimited" and "Counts towards total"; each name contains it):
    - en "Total unlimited", "New unlimited", "Learn unlimited", "Review unlimited";
      ru "Всего: неограниченно", "Новые: неограниченно", "Заучивание: неограниченно", "Повтор: неограниченно".
    - en "New counts towards total", "Learn counts towards total", "Review counts towards total";
      ru "Новые: в счёт всего", "Заучивание: в счёт всего", "Повтор: в счёт всего".
  - New message ids under `settings.learning.limits.*`; drop ids nothing uses from the `settings-react` catalogs.
  - e2e, both hosts: `settings-learning-form.spec.ts` picks these switches by name, with no `.first()` or `.nth()`.
  Constraints: `settings-learning.tsx`, the `settings-react` catalogs, both apps' compiled catalogs, and the learning
  e2e specs on both hosts.
  Done when: `SET settings-learning`, both compiles, `bun run typecheck`, `nx run web-e2e:typecheck`, and
  `nx run electron-e2e:typecheck` pass.
  The e2e specs are typechecked only; the human runs both suites.
  Manual verify:
  - Host: web.
  - Settings → Learning → in the browser's accessibility tree, the Review row's switches read "Review unlimited" and
    "Review counts towards total".
  Commit: Name each daily-limit switch by its cap
  Depends on: 5

- [ ] 7. Drop learning settings residue
  Goal (LS8):
  - `libs/app/src/lib/settings-learning.ts`: define `LearningSettings` as `z.input<typeof learningSettingsValidation>`
    and drop `LearningSettingsInput`; drop `LearningDailyLimitType`.
  - Parse once: the route (`_.settings.learning.tsx:37`) keeps its parse; `SettingsLearning` uses `data` as given
    (`settings-learning.tsx:73`).
  - Reset to the parsed return value unconditionally (`:85`), with the deck editor's WHY (a bare reset restores the
    pre-save values).
  - Make `getCurrentLearningDayRange` synchronous (`libs/srs/src/lib/reviews.ts:91-93`); update its caller
    (`libs/db-sqlite/src/lib/reviews.ts:52`) and its tests (`reviews.test.ts:16-36`).
  Constraints: the listed files and what typecheck flags; no behavior change.
  Done when: `bun run typecheck`, `bun run lint`, `APP`, `SRS reviews`, `SET`, and `DB settings-reviews` pass.
  Manual verify: none — no behavior change.
  Commit: Drop learning settings residue
  Depends on: 6

- [ ] 8. Give each learning rule one home in LEARNING-SETTINGS.md
  Goal (LS9):
  - Drop the glossary's "Each cap is unlimited or a non-negative number" (line 25); §Daily Limits line 55 keeps it.
  - Drop §Relationships line 36; §Defaults line 43 keeps the rule.
  - Replace line 86 with a pointer to LESSONS.md (§Default Amounts).
  - Replace "Save persists the whole settings payload" (line 125) with what the user sees: fields the user has not
    changed take values synced from other devices (SYNC.md (§Status)).
  Constraints: LEARNING-SETTINGS.md only; per `agents/FUNCTIONAL-SPECIFICATIONS.md` and `agents/MARKDOWN.md`.
  Done when: `bun run check:markdown` passes, and each rule above appears once in the spec.
  Manual verify: none — docs-only.
  Commit: Give each learning rule one home in LEARNING-SETTINGS.md
  Depends on: 5

- [ ] 9. Check learning settings saves by outcome in both e2e suites
  Goal (LS5, e2e part; LS1's regression):
  - `settings-learning-form.spec.ts`, both hosts, "Validation 4": also bring New to 5 or below, then assert the save
    succeeds (Save hides) and no exceeds-total message shows.
  - `settings.spec.ts`, both hosts: retitle the learning case to what it changes (limits and learn-ahead), and check
    persistence after a page reload, not only in-app navigation.
  - New flow, both hosts: on the Dashboard, read New's limit; in Settings → Learning, set New to 10 and the day start
    to a different time; save; open the Dashboard without reloading → New's limit is 10; reload Settings → Learning →
    the day start is kept.
    The flow does not assert which reviews fall in the window (question 3).
  - Use item 6's switch names.
  Constraints: the learning e2e specs on both hosts, and `libs/e2e` only if a step is shared by both.
  Done when: `nx run web-e2e:typecheck` and `nx run electron-e2e:typecheck` pass.
  The cases are typechecked only; the human runs both suites.
  Manual verify: none — this item is the e2e coverage; run `settings-learning-form` and `settings` on both hosts.
  Commit: Check learning settings saves by outcome in both e2e suites
  Depends on: 1, 6

## Outcome

<what shipped>
