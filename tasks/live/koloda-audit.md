# Koloda crate audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, agents/RUST.md, docs/decisions/TS-RUST-DOMAIN-MIRRORING.md, docs/specs/LEARNING-SETTINGS.md, docs/decisions/MEDIA-STORAGE.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/BACKWARDS-COMPATIBILITY.md, agents/MARKDOWN.md, agents/VERIFY.md, agents/REVIEW.md
Flow: local

## Intent

Settle every finding of the audit of the `koloda` crate (`crates/koloda`) at `55a6a2e4` (`task/sync-late-images`).
There, `crates/koloda`, `libs/`, and `apps/` were identical to `main` at `adf4dc89`.
Its report was `tmp/audits/koloda.md`, which git ignores.
This file restates every finding and its evidence, so neither the next session nor the archive reader needs it.
The audit ran `cargo test -p koloda`: 1 unit test passed, domain 396 passed and 1 ignored, integration 303 passed
and 1 ignored.
It also probed the crate from a scratch binary on an in-memory database, and timed the sweep in the SQLite CLI.
Its verdict: the crate is in good health.
Layers hold, validation codes match the TS twins, and every write captures for sync in its own transaction.
One finding is Must-fix, four are Should-fix, and five are Later residue.
Each finding was checked again against `a78223ac` when this task was scheduled, and each still holds.

Done when:

- saving a daily Total of 0 keeps 0 on both hosts, and the learning form shows 0 after save, not Unlimited;
- the learning caps and learn-ahead values accept only whole numbers on both hosts;
- the launch-time attachment sweep reads the cards once, not once per attachment;
- `update_card` decides what to capture from the row its transaction reads;
- cards, reviews, decks, templates, and algorithms each have a full-field roundtrip test;
- the test-only validation methods, stale shims, duplicate tests, misplaced types, and the duplicate lock query are
  gone;
- `bun run check:push` is green.

## Scope

Findings, numbered as in the report.
Line numbers are at `a78223ac`.

- 1. Spec violation, Must-fix: saving a daily Total of 0 stores "unlimited" on both hosts.
  Decision: fixed by item 1, with no migration (question 1).
  - `docs/specs/LEARNING-SETTINGS.md` §Daily Limits: "Zero is a hard cap for that limit."
    "A Total of zero is a hard cap for Total."
    "When Total is zero, a counted per-type number must be zero."
  - Rust: `deserialize_total` maps 0 to `None` (`crates/koloda/src/domain/settings_learning.rs:199-210`, wired at
    `:120`).
    `SettingsName::normalize` runs it on every save (`domain/settings.rs:76-79`), from `set_settings`
    (`repo/settings.rs:92`) and `patch_settings` (`:193`).
    Its WHY says the hard-cap `Some(0)` "is constructed in tests without going through this deserializer".
    No production path can produce it.
  - TS: the defaulting schema maps 0 to `null` (`libs/app/src/lib/settings-learning.ts:124-127`).
    It is `allowedSettings.learning` (`libs/settings/src/index.ts:15`), which web `setSettings` parses with
    (`libs/db-sqlite/src/lib/settings.ts:29`).
  - What the user sees: the form validates with the resolved schema, which keeps 0
    (`libs/settings-react/src/lib/settings-learning.tsx:63`).
    It sends that 0, then resets from the returned row parsed by the defaulting schema (`:71`).
    So after saving 0, the Total field shows Unlimited.
  - Probe: `set_settings` with `dailyLimits.total: 0` stored `null`, and `get_todays_review_totals` gave
    `daily_limits.total = None`.
    Total 0 with a counted New cap of 50 was accepted and stored as unlimited, against the third quoted rule.
    `counted_exceeds_total` (`settings_learning.rs:157-162`) would refuse it once 0 survives.
  - Tests pin the schemas, not the save: `crates/koloda/tests/domain/settings_learning_tests.rs:264` (0 coerces to
    unlimited), `libs/app/src/lib/settings-learning.test.ts:167` and `:389`.
    No test saves 0 through `set_settings` or `setSettings` and reads it back, and no e2e spec saves Total 0.
  - The hosts agree with each other; both contradict the spec.
  - Legacy rows: the 0-means-unlimited rule ended on 2026-09-19 (`tasks/archive/unlimited-daily-limits.md`).
    The baseline wipe was on 2026-09-09.
    So a stored 0 with the old meaning can exist only where Total was set to 0 between those dates.
    Learning values travel already normalized (`repo/settings.rs:92`, `:115`), so no legacy 0 is on the sync wire.
- 2. Risk, Should-fix: the startup attachment sweep scans every card once per attachment, on the only DB connection.
  Decision: fixed by item 3.
  - `crates/koloda/src/repo/attachments.rs:83-99` deletes attachments older than the cutoff where
    `NOT EXISTS (SELECT 1 FROM cards WHERE instr(cards.content, 'attachment:' || attachments.id) > 0)`.
    The web twin is the same (`libs/db-sqlite/src/lib/attachments.ts:45-56`).
  - It runs once per app session, at `App` mount (`libs/app-react/src/lib/components/app.tsx:24`).
    The cutoff is 24 hours ago (`libs/app-react/src/lib/hooks/use-attachment-sweep.ts:8`, `:20-24`).
    So every attachment older than a day is checked on each launch.
  - On desktop it runs on the one FIFO database worker (`apps/electron/src-rust/src/lib.rs:671-676`; worker
    invariant `:133-138`), holding the single connection (`crates/koloda/src/app/db.rs:21-25`).
    Every query issued after it waits, and the sync worker blocks on the same mutex.
  - A referenced attachment scans cards until its first referrer; an unreferenced one scans them all.
    That is about attachments × cards / 2 substring searches.
  - Measured in the SQLite 3.53.4 CLI on `cards(id, content)` and `attachments` as in `V3`.
    The data was 20,000 cards (average content 351 characters) and 2,000 attachments, each linked from every 10th card.
    The statement ran in 11.8 s and deleted nothing.
- 3. Risk, Should-fix: TS accepts fractional learning limits that Rust refuses with an untranslated `unknown` error,
  and the web stores them.
  Decision: fixed by item 2.
  - Rust is integer-only: `dailyLimits.total` is `Option<u32>` (`settings_learning.rs:121`), each per-type `value`
    is `Option<u32>` (`:244`), and `learnAheadLimit` is `(u32, u32)` (`:334`).
  - TS takes any non-negative number: `dailyLimitCapValidation` is `z.number().min(0).nullable()`
    (`libs/app/src/lib/settings-learning.ts:41`), and the learn-ahead tuples are `z.number()` (`:141`, `:151`).
    Every other integer twin uses `z.int()` (`libs/srs/src/lib/cards.ts:20-28`, `reviews.ts:34-42`,
    `attachments.ts:15-17`).
  - The form's `NumberField`s set no integer format (`libs/settings-react/src/lib/settings-learning.tsx:32-43`,
    `:188-212`).
    The shared field sets only `useGrouping: false` (`libs/ui/src/lib/primitives/form/number-field.tsx:19`).
    So a typed `1.5` reaches the save.
  - Probe: `normalize` with `learnAheadLimit: [1.5, 30]` returned `unknown` ("invalid type: floating point `1.5`,
    expected u32").
    A New `value` of `10.5` returned `unknown` ("data did not match any variant of untagged enum
    CountedDailyLimitPartial").
  - This is not one of `TS-RUST-DOMAIN-MIRRORING.md` §Accepted divergences (i32 upper bounds, i64 step amounts,
    explicit `null`).
- 4. Risk, Should-fix: cards, reviews, decks, templates, and algorithms have no full-field roundtrip test.
  Decision: fixed by item 5.
  - `agents/TESTING.md` (§Layers and what each owns) wants one per entity at the integration layer.
    It is "the only check that catches SQL↔struct column-mapping drift".
  - Only attachments have one (`tests/integration/attachments_integration_tests.rs:35`).
  - The nearest, `tests/integration/lessons_integration_tests.rs:11-67`, asserts 3 of a card's 10 progress columns
    and 4 of a review's 12.
    Stability and difficulty are both 5.0 there, so a swap of those two still passes.
  - `tests/integration/sync_apply_integration_tests.rs:95-103` compares two replicas through the same row mapper.
    A column swap in `get_card_row` (`src/repo/cards.rs:25-48`) or `get_deck_row` passes on both sides.
  - Only one test reads `notes` back through a repo, after a sync collision (`sync_collision_integration_tests.rs:237`).
- 5. Risk, Should-fix: `update_card` decides what to capture from a row read outside its transaction.
  Decision: fixed by item 4.
  - `crates/koloda/src/repo/cards.rs:274-321` reads `original` with `get_card` (`:276`) before `with_transaction`
    (`:295`).
    It updates without checking the row count (`:296-303`), and captures when `original.content` differs from the
    new content (`:305-314`).
  - The sync engine applies remote envelopes on another worker over the same connection
    (`apps/electron/src-rust/src/lib.rs:189-196`).
    The lock is taken per call (`crates/koloda/src/app/db.rs:49-62`), so an apply can land between `:276` and `:295`.
  - If a remote delete lands first, the `UPDATE` matches nothing.
    A register (`repo/sync/mod.rs:389-426`) and a content envelope for the tombstoned card still commit, then the call
    fails with `db.update`.
  - If a remote content edit lands first and the user saves the content unchanged, nothing is captured.
    The `UPDATE` writes the pre-edit content locally, and the device disagrees with the space until the card's next
    content edit.
  - The twins re-read inside the transaction and stop when the row is gone (`repo/decks.rs:191`, `:213-215`;
    `repo/templates.rs:261`, `:275-277`; `repo/algorithms.rs:195-214`).
  - The window is the gap between two lock acquisitions, so this is rare.
- 6. Improvement, Later: five validation entry points only tests call.
  Decision: fixed by item 6 (question 2).
  - `SettingsName::validate` (`crates/koloda/src/domain/settings.rs:48-67`) has no production caller.
    Production saves and reads through `normalize` (`:69-93`).
  - `AISecrets::validate` (`domain/ai.rs:198-201`) and `AIProfile::validate` (`:240-243`) are aliases with no
    production caller.
    Production calls `AISecrets::validate_for_input` (`repo/ai.rs:172`, `:223`), and `AISettings::validate` through
    `normalize`.
  - `AIProfile::validate_for_input` (`ai.rs:245-255`) is reached only from `AISettings::validate_for_input`
    (`domain/settings_ai.rs:67-73`), which has no production caller.
  - The audit searched `crates/koloda/src`, `crates/koloda-sync/src`, and `apps/electron/src-rust/src`.
  - Tests use them: `settings_interface_tests.rs:213`, `:233`; `settings_learning_tests.rs:608-687`;
    `settings_hotkeys_tests.rs:173-204`; `settings_ai_tests.rs:280-308`, `:351`; `ai_tests.rs:40-158`, `:241-525`.
  - `agents/BACKWARDS-COMPATIBILITY.md`: "Do not leave … unused exports."
- 7. Improvement, Later: stale compatibility shims.
  Decision: fixed by item 7 (question 2).
  - `alias = "api_key"` and `alias = "base_url"` sit on every `AISecrets` variant (`domain/ai.rs:46-95`).
    No writer in `libs/` or `apps/` emits snake_case, and Rust serializes `apiKey` and `baseUrl`.
    `git log -S 'alias = "api_key"'` stops at `bdc0068c`, before the crate left the Tauri app.
    Tests pin them: `tests/domain/ai_tests.rs:115`, `:127`, `:176`.
  - `domain/time.rs:48-50` is a second timestamp parser that never succeeds.
    `parse_from_str` with a literal `Z` and no `%z` has no offset; the probe got `ParseError(NotEnough)` for
    `2024-01-02T03:04:05Z` and `…05.123Z`.
    Any string it targets is valid RFC 3339 and is already taken at `:45`.
  - `get_card_row` reads NULL stability and difficulty as 0, "from the old insert" (`repo/cards.rs:36-39`).
    Writes became non-null on 2026-09-07 (`be64d7a7`), and the 2026-09-09 baseline wiped every local database
    (`4d444b34`).
    No writer stores NULL: the column defaults to 0 (`V1__init.sql:40-41`), `add_card` writes 0, and apply takes
    `f64` from the wire.
    The web row schema would reject such a row (`libs/srs/src/lib/cards.ts:23-24`).
    A test pins the shim: `tests/integration/cards_integration_tests.rs:318`.
- 8. Improvement, Later: duplicate and passthrough tests.
  Decision: fixed by item 8 (question 2).
  - `tests/domain/conversations_tests.rs` (13 serde tests) repeats what `conversations_serde_tests.rs:19-56` pins by
    exact JSON.
    Keys and RFC 3339: `:6` against `:19`; null optionals: `:45` against `:35`; round trips `:237`, `:270`, `:292`
    against `:49`.
    `:141` pins `default_now` on `Conversation.created_at`, a DTO production only serializes.
    It alone has `f64` `updatedAt` on `SetConversationInput` (`:168`) and an invalid `updatedAt` string (`:182`).
  - `tests/domain/lessons_validation_tests.rs:16` repeats `lessons_result_tests.rs:55` with the same payload and
    assertion; its own WHY says the other cases were folded away.
  - Passthrough tests (`TESTING.md` §Banned patterns): `algorithms_fsrs_tests.rs:370-403` asserts a bool
    deserializes to itself.
    `algorithms_tests.rs:166-222` asserts that `CloneAlgorithmData` and `DeleteAlgorithmData` fields equal their JSON.
  - `tests/common/mod.rs:26-28` `fsrs_content` aliases `fsrs_algorithm_content`, with one caller
    (`tests/integration/e2e_learning_workflow_tests.rs:18`).
- 9. Improvement, Later: types outside their home.
  Decision: fixed by item 9 (question 2).
  - `domain/settings_ai.rs:10` re-exports `AIProfile` and `AISecrets` from `domain::ai`.
    `repo/ai.rs:13` and `tests/domain/ai_serde_tests.rs:1` import them through it.
  - `SetConversationInput` lives in `repo/conversations.rs:66-75`.
    `agents/RUST.md` (Per-task notes, Entity CRUD) puts types in `src/domain/<entity>.rs`.
    The addon (`apps/electron/src-rust/src/lib.rs:574`) and tests import it from `repo`.
- 10. Improvement, Later: `update_template` asks for the lock twice through a one-call-site helper.
  Decision: fixed by item 10 (question 2).
  - `get_template` already computes `is_locked` (`repo/templates.rs:82-86`).
  - `update_template` queries it again through the public `is_template_locked` (`:226-238`, called at `:248`), its
    only caller in `crates/`, `apps/electron/src-rust/src`, `libs/`, or `apps/electron/src`.

The audit also re-checked an item `tasks/archive/sync-repo-followups.md` left unverified.
`delete_empty_cohort` might delete a capture's own cohort when the capture replaces that cohort's only row.
It found the case unreachable but unpinned.
`07f31508` (`sync-proto-followups`) since keeps that cohort and pins it with a test, so nothing is left here.

In:

- `koloda`: learning settings serde, the attachment sweep, `update_card`, `update_template`, the five validation
  methods, the AI aliases, the timestamp parser, `get_card_row`, `SetConversationInput`, and the crate's tests.
- `@koloda/app`: the learning settings schemas and their tests.
- `@koloda/settings-react`: the learning form's number fields.
- `@koloda/db-sqlite`: the attachment sweep and the settings and attachment integration tests.
- The desktop addon: the `SetConversationInput` import only.

Out:

- A migration for stored Totals of 0 (question 1).
- Any spec edit: `LEARNING-SETTINGS.md` §Daily Limits already says what item 1 makes true.
- `is_wanted` in `src/repo/sync/attachments.rs`: it keeps its per-retry scan, which its WHY already bounds.
- Web-host roundtrip tests in `@koloda/db-sqlite`: the audit read the TS repos only as twins.
- The engine, the server, and the sync wire.

## Open questions

- [x] 1. Finding 1: migrate stored Totals of 0 to `null`, or drop the mapping with no migration? — no migration
  (human, 2026-10-19).
  A leftover 0 from 2026-09-09 to 2026-09-19 then reads as a hard cap, which the user sees and can change.
  This follows `agents/BACKWARDS-COMPATIBILITY.md` for pre-release.
  Not chosen: a `V19` data migration that rewrites a stored `dailyLimits.total` of 0 to `null`.
- [x] 2. Triage of the Later findings 6 to 10? — fix all in this task, one item each (human, 2026-10-19).
- [x] 3. Flow? — `local` (human, 2026-10-19).

## Plan

- [x] 1. Keep a saved daily Total of 0 as a hard cap on both hosts
  Goal (finding 1; question 1):
  - Rust: delete `deserialize_total` (`crates/koloda/src/domain/settings_learning.rs:199-210`) and its
    `deserialize_with` on `DailyLimits.total` (`:120`).
    Keep `default = "default_daily_limits_total"`, so a missing key still reads 200 and an explicit `null` reads
    unlimited.
  - TS: in the defaulting schema (`libs/app/src/lib/settings-learning.ts:124-127`), drop the `z.preprocess` and its
    WHY.
    `total` becomes `dailyLimitCapValidation.default(200)`.
    The resolved and defaulting schemas stay separate; they still differ by their defaults.
  - Delete every comment on either host that says a stored 0 means unlimited.
  - Rewrite the two coercion tests to the new rule: `settings_learning_tests.rs:264` and
    `settings-learning.test.ts:167`.
    Total 0 with every counted per-type value 0 parses and keeps 0.
    Total 0 with a counted New (`untouched`) of 50 is refused with the untouched exceeds-total code, on each host.
  - Add a save → read test per host.
    Rust, in `tests/integration/settings_integration_tests.rs`: `set_settings` learning with Total 0, then
    `get_settings` reads 0, and `get_todays_review_totals` gives `daily_limits.total == Some(0)`.
    Web, in `libs/db-sqlite/src/lib/settings-reviews.integration.test.ts`: `setSettings` with Total 0, then
    `getSettings` reads 0.
  Constraints: no migration and no spec edit.
  Leave sync apply and the lesson limit math alone; they already treat `Some(0)` as a hard cap.
  Done when:
  - `cargo test -p koloda -p koloda-sync` passes;
  - `bunx vitest run --config libs/app/vitest.config.mjs --configLoader runner settings-learning` passes;
  - `bunx vitest run --config libs/db-sqlite/vitest.config.mjs --configLoader runner settings` passes;
  - the item ends with a Manual verify block for web and desktop.
    Settings → Learning → set Total, New, and Review to 0 → Save → Total shows 0, not Unlimited, also after a
    reload.
    Then set New to 50 → Save → "New can't be more than total" shows.
  Commit: Keep a saved daily Total of 0 as a hard cap
  Depends on: none

- [x] 2. Accept only whole numbers for learning limits
  Goal (finding 3):
  - `dailyLimitCapValidation` (`libs/app/src/lib/settings-learning.ts:41`) becomes `z.int().min(0).nullable()`.
  - Both learn-ahead tuples (`:141`, `:151`) use `z.int()` in place of `z.number()`, keeping their bounds.
  - The learning form's caps (`libs/settings-react/src/lib/settings-learning.tsx:32-43`) and learn-ahead fields
    (`:188-212`) pass `formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }}`.
    A typed fraction then rounds on blur instead of reaching the save.
    `NumberField` spreads its props after its own `formatOptions`
    (`libs/ui/src/lib/primitives/form/number-field.tsx:19`), so the form must repeat `useGrouping: false`.
  - Rust stays: `Option<u32>` and `(u32, u32)` already refuse fractions.
  - Twin tests refuse 1.5 for Total, for a per-type value, and for each learn-ahead slot.
    TS in `settings-learning.test.ts`, Rust through `SettingsName::Learning.normalize` in `settings_learning_tests.rs`.
  Constraints: no change to the shared `NumberField`; other fields need fractions.
  Done when:
  - `cargo test -p koloda --test domain` passes;
  - `bunx vitest run --config libs/app/vitest.config.mjs --configLoader runner settings-learning` passes, and the
    `@koloda/settings-react` tests pass if it has any for this form;
  - the item ends with a Manual verify block for web.
    Settings → Learning → type 1.5 in Total, then in Hours → each shows a whole number on blur, and Save stores it.
  Commit: Accept only whole numbers for learning limits
  Depends on: 1

- [x] 3. Sweep unreferenced attachments in one pass over cards
  Goal (finding 2):
  - Desktop `sweep_attachments` (`crates/koloda/src/repo/attachments.rs:83-99`) and web `sweepAttachments`
    (`libs/db-sqlite/src/lib/attachments.ts:45-56`) drop the correlated `NOT EXISTS (… instr …)`.
    Both do this instead:
    1. read the ids of attachments created before the cutoff, and return when there are none;
    2. read every card's `content` once, and collect each `attachment:` followed by 64 lowercase hex characters into
       a set (the id shape in `libs/srs/src/lib/attachments.ts:9`);
    3. delete the candidates missing from the set.
  - All three steps run in one transaction, so a card saved in between cannot lose its image.
    Desktop uses `with_transaction`; web uses `db.transaction`, as `addAttachment` does (`attachments.ts:27`).
  - Keep the WHY about JSON escaping, restated for the scan.
    Bytes still go through the foreign-key cascade.
  - Today the cost is about attachments × cards / 2 substring searches.
    The audit measured 11.8 s for 20,000 cards and 2,000 attachments, deleting nothing.
  - Extend the sweep tests on both hosts (`attachments_integration_tests.rs:94`, `attachments.integration.test.ts:91`).
    One card references two old attachments, and both survive while an old unreferenced one is deleted.
  Constraints: `is_wanted` in `src/repo/sync/attachments.rs` keeps its scan.
  The cutoff and when the sweep runs do not change.
  Done when:
  - `cargo test -p koloda -p koloda-sync` passes;
  - `bunx vitest run --config libs/db-sqlite/vitest.config.mjs --configLoader runner attachments` passes;
  - Manual verify: none — the same rows are deleted, and both hosts' integration tests pin which.
  Commit: Sweep unreferenced attachments in one pass over cards
  Depends on: none

- [x] 4. Read the card inside update_card's transaction
  Goal (finding 5):
  - `update_card` (`crates/koloda/src/repo/cards.rs:274-321`) keeps its first `get_card`.
    That read still answers `NOT_FOUND_CARDS_UPDATE_CARD` and finds the template to validate against; a card's
    template does not change.
  - Inside `with_transaction`, read the card again with `select_card(tx, &data.id)`.
    When it is gone, stop before the `UPDATE` and the capture, as `update_deck` does (`repo/decks.rs:191`,
    `:213-215`).
  - Compare the new content with that row's `content`, and take the capture's `deck_id` from it.
  - Give the in-transaction read a WHY: the sync engine applies remote envelopes over the same connection between
    two lock acquisitions (`apps/electron/src-rust/src/lib.rs:189-196`, `crates/koloda/src/app/db.rs:49-62`).
  Constraints: no new test.
  No test can enter the window between two lock acquisitions of one call without a hook in production code.
  The existing update cases in `cards_integration_tests.rs` and `cards_sync_integration_tests.rs` pin the capture.
  Done when:
  - `cargo test -p koloda -p koloda-sync` passes;
  - Manual verify: none — the change is the order of reads inside one repo call.
  Commit: Read the card inside update_card's transaction
  Depends on: none

- [x] 5. Add full-field roundtrip tests for five entities
  Goal (finding 4):
  - Add one integration roundtrip each for cards, reviews, decks, templates, and algorithms.
    Each writes a distinct value to every column, reads the row back through the repo, and compares every field.
    No two numeric columns share a value, so a column swap fails; stability and difficulty differ.
  - Cards, in `cards_integration_tests.rs`: `add_card` with every progress field set, then compare the whole
    `get_card` result.
  - Reviews, in `reviews_integration_tests.rs`: `submit_lesson_result`, then compare the whole `get_reviews` row.
  - Decks, templates, and algorithms, in their `*_integration_tests.rs`: `update_*` with `notes` set, then compare
    the whole struct.
  Constraints: tests only; no production change.
  Done when:
  - `cargo test -p koloda --test integration` passes;
  - Manual verify: none — tests only.
  Commit: Add full-field roundtrip tests for cards, reviews, decks, templates, and algorithms
  Depends on: none

- [x] 6. Delete validation methods only tests call
  Goal (finding 6):
  - Delete `SettingsName::validate` (`crates/koloda/src/domain/settings.rs:48-67`), `AISecrets::validate`
    (`domain/ai.rs:198-201`), `AIProfile::validate` (`:240-243`), `AIProfile::validate_for_input` (`:245-255`), and
    `AISettings::validate_for_input` (`domain/settings_ai.rs:67-73`).
  - Point their tests at the doors production uses: `SettingsName::normalize`, `validate_for_storage`, or
    `AISecrets::validate_for_input`.
    The tests are in `settings_interface_tests.rs:213`, `:233`; `settings_learning_tests.rs:608-687`;
    `settings_hotkeys_tests.rs:173-204`; `settings_ai_tests.rs:280-308`, `:351`; `ai_tests.rs:40-158`, `:241-525`.
  - Keep each test's assertion and error code; only the door changes.
    Delete a test that then repeats another.
  Constraints: `AISettings::validate` stays; `normalize` calls it.
  Done when:
  - `cargo test -p koloda -p koloda-sync` and `nx run @koloda/electron:test-rust` pass;
  - Manual verify: none — test-only methods.
  Commit: Delete validation methods only tests call
  Depends on: none

- [x] 7. Delete the stale AI aliases, timestamp fallback, and NULL stability read
  Goal (finding 7):
  - Delete `alias = "api_key"` and `alias = "base_url"` from every `AISecrets` variant
    (`crates/koloda/src/domain/ai.rs:46-95`), and the tests that pin them (`tests/domain/ai_tests.rs:115`, `:127`,
    `:176`).
    A fourth pin the audit missed sits in `tests/domain/ai_serde_tests.rs:80-83`; it goes too.
  - Delete the `parse_from_str` fallback in `parse_iso_timestamp` (`domain/time.rs:48-50`).
    It never succeeds: a literal `Z` with no `%z` has no offset.
  - In `get_card_row` (`repo/cards.rs:36-39`), read stability and difficulty as `f64` and drop the INVARIANT.
    Delete the test that pins the NULL read (`tests/integration/cards_integration_tests.rs:318`).
  Constraints: no schema change; `V1` already defaults both columns to 0.
  Done when:
  - `cargo test -p koloda -p koloda-sync` passes;
  - Manual verify: none — no writer emits what these shims read.
  Commit: Delete stale AI aliases, timestamp fallback, and NULL stability read
  Depends on: 6

- [x] 8. Delete duplicate and passthrough koloda tests
  Goal (finding 8):
  - Move two cases from `tests/domain/conversations_tests.rs` into `conversations_serde_tests.rs`.
    They are `f64` `updatedAt` on `SetConversationInput` (`:168`) and an invalid `updatedAt` string (`:182`).
    Then delete `conversations_tests.rs` and its line in `tests/domain/main.rs`.
  - Delete `tests/domain/lessons_validation_tests.rs` and its `main.rs` line.
    `lessons_result_tests.rs:55` keeps the case.
  - Delete the passthrough tests: `algorithms_fsrs_tests.rs:370-403`, and `algorithms_tests.rs:166-222`.
    That range holds five tests; three assert fields equal their JSON and go.
    The two that a missing `title` or `sourceId` fails stay; they pin that both fields are required.
  - Inline `fsrs_content` (`tests/common/mod.rs:26-28`) at its one caller
    (`tests/integration/e2e_learning_workflow_tests.rs:18`), and delete it.
  Constraints: tests only.
  Done when:
  - `cargo test -p koloda` passes;
  - Manual verify: none — tests only.
  Commit: Delete duplicate and passthrough koloda tests
  Depends on: none

- [x] 9. Move the AI types and SetConversationInput to their domain homes
  Goal (finding 9):
  - Delete the re-export of `AIProfile` and `AISecrets` in `crates/koloda/src/domain/settings_ai.rs:10`.
    Import them from `domain::ai` in `repo/ai.rs:13`, `tests/domain/ai_serde_tests.rs:1`, and any other importer.
  - Move `SetConversationInput` (`repo/conversations.rs:66-75`) to `domain/conversations.rs`, with its serde
    attributes.
  - Update every importer: `repo/conversations.rs`, the addon (`apps/electron/src-rust/src/lib.rs:574`),
    `tests/common/fixtures.rs:125`, `tests/integration/conversations_integration_tests.rs`, and
    `tests/domain/conversations_serde_tests.rs`.
    `repo` does not re-export it.
  Constraints: no behavior or wire change.
  Done when:
  - `cargo test -p koloda -p koloda-sync` and `nx run @koloda/electron:test-rust` pass;
  - Manual verify: none — type moves only.
  Commit: Move the AI types and SetConversationInput to their domain homes
  Depends on: 8

- [x] 10. Use the read template's lock flag in update_template
  Goal (finding 10):
  - In `update_template` (`crates/koloda/src/repo/templates.rs:248`), use `original.is_locked`, which
    `get_template` computes (`:82-86`).
  - Delete `is_template_locked` (`:226-238`).
    It has no other caller in `crates/`, `apps/electron/src-rust/src`, `libs/`, or `apps/electron/src`.
  Constraints: the lock check keeps its place and its error.
  Done when:
  - `cargo test -p koloda -p koloda-sync` passes;
  - `bun run check:push` is green on the tip;
  - Manual verify: none — the same flag, read once.
  Commit: Use the read template's lock flag in update_template
  Depends on: none

## Outcome

<what shipped>
