# Assistant data access and card generation audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, agents/ASSISTANT-MAP.md, docs/specs/ASSISTANT-CARD-GENERATION.md, docs/specs/ASSISTANT-DATA-ACCESS.md, agents/ADD-ASSISTANT-TOOL.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/VERIFY.md, agents/I18N.md, agents/BACKWARDS-COMPATIBILITY.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/MARKDOWN.md, libs/srs/README.md, apps/web-e2e/README.md, apps/electron-e2e/README.md, libs/e2e/README.md, apps/electron/IPC.md, libs/native-ipc/README.md, docs/specs/ASSISTANT-MESSAGES.md
Flow: local

## Intent

Settle every finding of two audits of the assistant feature, as one task.

- The data access slice, `docs/specs/ASSISTANT-DATA-ACCESS.md`: the eight chat tools, their budgets, tool-row
  visibility, retry with tools, and saved tool activity.
- The card generation slice, `docs/specs/ASSISTANT-CARD-GENERATION.md`: how `propose_cards` turns a model call into
  accepted cards, the review table, selection, Add, history, and copy.

Both audits read `7b8e8c1c` (`main`).
Their reports are not in git, so this file restates every finding and its evidence.
Neither the next session nor the archive reader needs the reports.

Triage checked each finding again at `af83b068`, where this task branches (87 commits later).
It read the cited lines and did not run tests.

- Twenty-three findings still hold; only line numbers moved. The current lines are in Scope.
- C4 was already fixed by `286e708b` (messages task).
- The conversation-reducer re-exports that the card report saw in passing were fixed by `281167aa`.

Done when, in user-visible terms:

- After Add, the card statuses and the deck's card list update even if the user switched conversation first.
  Once an Add has settled, a reload never re-adds its cards.
- A deleted write-target deck shows the unavailable notice, not an Add button that fails every card.
- A tool row for a long list shows its count, and a get_deck or add_deck row shows its title.
- A card with an empty required field never reaches the table; the model gets it back in the same turn.
- An Add that fails to reach the host leaves its rows selectable again.
- A tool call the user cancels reads Canceled, not Failed.
- A long template list previews its notes, and `get_template` returns the full note.
- A run that stops at the step budget says so under its status.
- The Russian truncated output label matches the plain one.
- `bun run check:push` passes on the tip, and every plan item is one commit with a `Task:` trailer.

## Scope

In: the 24 findings below.
Labels C1–C11 (card generation) and D1–D13 (data access) keep the numbers of their reports.
Each entry gives its classification, severity, current `file:line` at `af83b068`, and the decision.
Paths without a package prefix are under `libs/assistant-react/src/lib/`.

Out:

- Run lifecycle, retry availability, and history (ASSISTANT-CONVERSATIONS.md); clone (ASSISTANT-CONVERSATION-LIST.md);
  reasoning rows (ASSISTANT-MESSAGES.md); prompt editing (ASSISTANT-SETTINGS.md).
  Earlier slices own them.
- `libs/srs-react/src/lib/cards/add-card.tsx:58-65`, seen in passing by the card report.
  It refreshes from per-call `mutate` callbacks and drops the invalidation if the dialog unmounts, the same defect as C1.
  It belongs to the cards slice (CARDS.md), not here.
- Changes to the Rust `add_cards` or `add_deck` behavior.
  The reports found both hosts in agreement on every read and write.

Skipped:

- D8's file move.
  The report asks that the `chat tool streaming` block move to `chat-stream.test.ts`.
  The fake-model harness lives in `assistant-tools.test.ts`.
  The assistant-messages task kept these cases there because a second file-level mock of `ai-sdk-ollama` would leak
  under `isolate: false` (`tasks/archive/assistant-messages-audit.md`, Outcome).
  Item 14 rewrites the cases where they are.
  Revisit only together with the harness.

### Card generation

C1 — Spec violation, Should-fix. Add loses its result when the review table unmounts.
Decision: fixed by item 2.

- `libs/assistant-react/src/lib/ui/use-assistant-cards-table.tsx:130-148` passes the settle and invalidate callbacks to
  `mutation.mutate`.
  TanStack runs per-call callbacks only while the observer has listeners.
  The table unmounts on a conversation switch and when the user leaves the assistant route.
- Result: statuses stay `pending` for the session (`:126-128`); the deck and lessons queries are not invalidated
  (`:132-133`).
  After a reload, restore turns `pending` into `idle` (`libs/assistant-react/src/lib/persistence/conversation-persistence.ts:86`)
  and idle rows start selected, so pressing Add again inserts duplicates.
- The test for "switching away" keeps `SelectionProbe` mounted (`ui/assistant-cards-table.test.tsx:170-205`), so it
  passes with the defect present.
- A retry reuses the run id and clears the run's cards (`state/conversation-run-lifecycle.ts:28-34`).
  A late settle write would then hit the new cards, so the fix must guard each write.

C2 — Risk, Should-fix. A deleted write-target deck leaves Add enabled.
Decision: fixed by item 3.

- `ui/assistant-cards-message.tsx:31-43` checks only the live template.
  `ui/use-assistant-message-renderer.tsx:101-112` computes `canAdd` from the stored ids, so a deleted deck still passes.
- Both hosts fail every card with `not-found.cards.add.deck` (`libs/db-sqlite/src/lib/cards.ts:116-118`,
  `crates/koloda/src/repo/cards.rs:199-206`).
  Each selected card becomes `error`, which is terminal: only idle rows are selectable (§Card Selection).
- §Adding Cards to Deck already says add is disabled with no write-target deck.
  §Card Display covers only the template case, and the code does not check the live deck.

C3 — Improvement, Should-fix. Add tests mock a response no host returns.
Decision: fixed by item 1.

- Every add mock resolves `{ insertedIds: [] }` or `{ insertedIds: [1] }`:
  `ui/assistant-cards-table.test.tsx:35, 136, 149, 161, 171-174, 208, 243` and
  `ui/assistant-chat-integration.test.tsx:152`.
  The real type is `InsertCardsResponse` (`libs/srs/src/lib/cards.ts:96`).
  `response[i]` on the mock is `undefined`, so every mocked add takes the success branch.
- Nothing tests per-card error mapping or the rejected-request path (`ui/use-assistant-cards-table.tsx:143-147`).

C4 — Improvement, Should-fix. The cards message keeps a status ladder no caller shows.
Decision: fixed before this task by `286e708b` (messages task); no plan item.

- `ui/assistant-cards-message.tsx` takes only live props now, and `renderCardsMessage` passes no status props
  (`ui/use-assistant-message-renderer.tsx:104-115`).
  The dead test cases are gone.

C5 — Improvement, Later. The `addCard` reducer action is dispatched only by tests.
Decision: fixed by item 4.

- Production adds cards through `setToolCallResult`, which calls the module function `addCard`
  (`state/conversation-run-tools.ts:9`, `:149`).
- The action-table entry (`state/conversation-reducer.ts:30`, import `:12`) is a second door.
  Tests that dispatch `["addCard", …]`: `state/conversation-reducer-runs.test.ts:80-96, :819, :852`;
  `state/conversation-reducer-messages.test.ts:268`; `state/assistant-conversation-store.test.ts:535`.

C6 — Improvement, Later. Runs accept a submit-time `templateFields` that nothing passes.
Decision: fixed by item 4.

- `submitTurn` and `startRun` payloads take `templateFields` (`state/conversation-run-stream.ts:92`, `:106`) and pass it
  to `makeRun` (`state/conversation-run-helpers.ts:18-29`).
- No production caller passes it.
  The only dispatch (`runs/use-run-orchestration.ts:160-169`) omits it.
  The restart path no longer calls `makeRun`; it resets the field directly (`state/conversation-run-lifecycle.ts:34`).
- The stored `run.templateFields` stays: the cards table reads it.

C7 — Improvement, Later. `makeHistoricalTemplate` builds a fake `Template` with a sentinel id.
Decision: fixed by item 5.

- `state/assistant-messages.ts:77` builds a whole `Template` with id `01900000-0000-7000-8000-000000000000`.
  Its consumers read only `content.fields`: `serializeGeneratedCards` in the same file, and the table
  (`ui/use-assistant-cards-table.tsx:45`).
- Call sites: `state/assistant-messages.ts:120`, `ui/use-assistant-message-renderer.tsx:97`, `:224`.
- `AssistantCardsMessage` takes both `template` (the fake id) and `templateId` (the real id)
  (`ui/assistant-cards-message.tsx:14-16`).

C8 — Improvement, Later. `transformGeneratedCards` is a one-caller helper that pulls `@koloda/ai` into `@koloda/srs`.
Decision: fixed by item 6.

- `ui/use-assistant-cards-table.tsx:118-122` calls it once per card with `[card]` and flattens.
  The helper is `libs/srs/src/lib/assistant-cards-generation.ts` (with its test), exported at
  `libs/srs/src/index.ts:22`.
- It is the only `@koloda/ai` import in `@koloda/srs` (`libs/srs/src/lib/assistant-cards-generation.ts:1`).
  It is the reason for the dependency in `libs/srs/package.json:19`, and `libs/srs/README.md:11` and `:26` name it.
- It spells out progress defaults that `insertCardSchema` already applies (`libs/srs/src/lib/cards.ts:20-29`).
  Manual add sends `{ content, deckId, templateId }` (`libs/srs-react/src/lib/cards/add-card.tsx:55`).
  So one insert has two payload shapes.

C9 — Improvement, Later. The spec states the initial-selection rule three times.
Decision: fixed by item 7.

- `docs/specs/ASSISTANT-CARD-GENERATION.md:33` (Selection glossary: "all cards start selected"), `:86` (§Card Display:
  "All rows are initially selected."), and `:134` (§Card Selection: "Initially, all generated cards are selected.").
- `agents/FUNCTIONAL-SPECIFICATIONS.md` asks for one home per rule.

C10 — Improvement, Later. The e2e twins cite spec line numbers that have drifted.
Decision: fixed by item 7.

- `apps/web-e2e/src/assistant-cards.spec.ts:102, 119, 124, 140, 211, 244` and
  `apps/electron-e2e/src/assistant-cards.spec.ts:103, 120, 125, 141, 212, 245` cite `ASSISTANT-CARD-GENERATION.md:<line>`.
  None of the cited lines holds its rule now.

C11 — Product decision, Later. Cards that cannot be saved are accepted, selected, and fail without a reason.
Decision: decided (open question 1); fixed by items 18 and 19.

- A proposal keeps any card with one non-empty value (`libs/ai/src/lib/assistant-tools.ts:545-561`; the WHY at `:558`
  makes required fields a save-time check).
  Keys that match no field are dropped without a count (`:533-543`).
  So `{ Front, Answer }` against a Front/Back template is accepted with an empty Back, `rejectedCount` 0, and no message
  (`:495-519`).
- Add fails the card on its required fields (`libs/srs/src/lib/cards.ts:51`; Rust `validate_content` at
  `crates/koloda/src/domain/cards.rs:257`).
  The row shows only an icon labeled "Error" (`ui/assistant-cards-table-select-cell.tsx:52-60`), and the item's error
  code is discarded (`ui/use-assistant-cards-table.tsx:137`).
- The spec sets this position on purpose (§Card Structure; §Card Selection: "Only cards in idle status are selectable").

### Data access

D1 — Spec violation, Should-fix. Tool rows lose their summary when the output is over 2,000 characters.
Decision: fixed by item 8.

- The spec's §Visibility (`docs/specs/ASSISTANT-DATA-ACCESS.md:167-173`) says a successful call shows how many came back,
  or the deck or template title.
- `libs/assistant-react/src/lib/state/conversation-run-tools.ts:74-92` (`boundToolOutput`) replaces an output over
  `MAX_TOOL_OUTPUT_CHARS` (2,000, `:71`) with `{ isTruncated, itemCount, totalCards?, acceptedCount?, rejectedCount?,
  preview }`.
  `itemCount` is the top-level key count (`:84`), so it is 1 for every list tool, and the title is dropped.
  The function runs on outputs (`:64`) and on inputs (`:37`), so the live row loses it too, not only a restored one.
- `libs/ai-react/src/lib/ai-tool-activity.tsx:353-400` (`toolCallSummaries`) reads `decks`, `templates`, and `algorithms`
  as arrays and `title` as a string.
  A bounded record has neither. The card tools survive only through `acceptedCount` (`:389`, `:394`).
- Probe from the report: `list_decks` lost its count at 14 decks without notes, and at 6 decks with 200-character notes;
  `list_algorithms` lost its count at 6 presets; `get_deck`, `get_template`, and `add_deck` lose the title for large
  templates.
- The test that should catch it locks it in: `state/conversation-reducer-runs.test.ts:261-283` feeds `list_decks` a string
  and asserts `itemCount` 1; `:176-190` asserts `itemCount` 1 for a `propose_cards` input.

D2 — Spec drift, Later. The spec does not describe two visible tool-row behaviors.
Decision: fixed by items 9 and 23.

- §Visibility (`docs/specs/ASSISTANT-DATA-ACCESS.md:153-183`) does not describe the shortened row.
  A payload over 2,000 characters is kept as a 400-character preview labeled "Output (truncated)" or "Input (truncated)"
  (`state/conversation-run-tools.ts:71-72`; `libs/ai-react/src/lib/ai-tool-activity.tsx:185-189`, `:222-237`).
- §Persistence (`:216-221`) covers only a crash.
  The live reducer also marks a running call failed when its run is canceled, fails, or is interrupted
  (`state/conversation-run-helpers.ts:57-66`, called from `state/conversation-run-lifecycle.ts:84-85`).
- Both behaviors are deliberate and carry WHY comments.

D3 — Spec hygiene, Later. The Core model restates the budgets, and the copy has drifted.
Decision: fixed by item 9.

- The glossary's Budgets entry (`docs/specs/ASSISTANT-DATA-ACCESS.md:39-40`) lists three caps.
  §Budgets (`:184-199`) has four, including the 150-character notes preview at `:186`.
- `agents/FUNCTIONAL-SPECIFICATIONS.md` (§Core model) says the glossary is not a preview of later sections.

D4 — Risk, Later. A cancel while `add_deck` is writing keeps the deck, but the row shows failed and the caches are not
refreshed.
Decision: cache refresh fixed by item 10; the row label is decided (open question 4), fixed by item 23.

- The binder checks the abort signal only before the host call (`libs/ai/src/lib/assistant-tools.ts:315-320`), so a
  write already in progress finishes.
- After an abort, the runtime drops tool events on purpose (`libs/assistant/src/lib/conversation-runtime.ts:284-289`).
  The reducer marks the running call failed (`state/conversation-run-helpers.ts:57-66`).
- The cache refresh runs only on a recorded success (`libs/assistant-react/src/lib/runs/add-deck-query-invalidation.ts`,
  `notifyAddDeckWritten`).
  So the deck exists, the row says failed, and a mounted decks list keeps stale data
  (`libs/app-react/src/lib/app-providers.tsx:62`, `staleTime` 60 s).
- The engine emit adapter (`libs/assistant-react/src/lib/runs/assistant-engine-instance.ts:26-29`) is where a refresh can go.

D5 — Risk, Later. `get_deck_cards` stops at the first card that does not fit, so one long card hides the rest.
Decision: fixed by item 11.

- `libs/ai/src/lib/assistant-tools.ts:436-444` `break`s at the first entry that goes past the 8,000-character budget
  (`:441`).
  A first card over the budget returns zero cards from a full deck; a long card at position 3 hides every card after it.
- Card fields have no length limit (`libs/srs/src/lib/cards.ts:46-52`).
- The spec's §Budgets says "An oversized deck degrades to the capped list" (`docs/specs/ASSISTANT-DATA-ACCESS.md:194`).

D6 — Improvement, Later. `ai-ipc.ts` keeps its own copy of the NAPI types, and the cast that joins them cannot catch drift.
Decision: fixed by item 12.

- `apps/electron/src/ai-ipc.ts:26-40` declares a second, narrower `KolodaDb` for the seven data methods the tools use,
  plus `getAiProfileSecrets`.
- `apps/electron/src/data-ipc.ts:97` joins it with `db as KolodaDb & Parameters<typeof registerAiIpc>[0]`.
  A cast to a subtype of the source always compiles.
  A scratch check in the report showed `getCardCounts` returning a record on one side and an array on the other, and the
  cast still compiled.
- The INVARIANT in `apps/electron/src/koloda-db.ts:8-11` keeps secrets off `KolodaDb`.

D7 — Improvement, Later. The legacy `dataAccess` snapshot is still typed, validated, and tested, but nothing reads it.
Decision: fixed by item 13.

- Search: `grep -rn "dataAccess\b\|DataAccessSnapshot\|DataAccessManifest" libs apps --include='*.ts' --include='*.tsx'`,
  ignoring `dist/`.
  The non-test hits are the type (`libs/assistant-react/src/lib/runs/data-access.ts:25`, `:35`;
  `state/conversation-types.ts:4`, `:75`), the restore schema (`persistence/conversation-persistence-schema.ts:93-94`,
  `:123-135`, `:184`, `:241`), and comments (`runs/prepare-run-request.ts:33`, `state/conversation-run-lifecycle.ts:38`).
- It is residue of the submit-time injection the spec rules out (`agents/ASSISTANT-MAP.md:55`).
  About 275 test lines guard it, in the cases the report lists.
- Comments that still point at it: `libs/ai/src/lib/assistant-tools.ts:18` ("mirrors the v1 data-access manifest");
  `agents/ASSISTANT-MAP.md:14` and `:36`.

D8 — Improvement, Later. The stream-level tool tests cover a cancel path that cannot happen, and miss the step budget and
tool errors.
Decision: fixed by item 14, except the file move (skipped; see Scope).

- `libs/ai/src/lib/assistant-tools.test.ts:1009-1043`: "aborts cleanly mid-tool-run when the executor honors the abort
  signal".
  The production executor never receives a signal (`AssistantToolExecutor`, `assistant-tools.ts:293`), so this test's
  executor settles on its own controller and hides D4.
- The step budget (`CHAT_TOOL_STEP_BUDGET = 8`, `libs/ai/src/lib/chat-stream.ts:17`, `stopWhen` at `:49`) has no test.
  Spec §Tools says "If it keeps calling instead of answering, the run stops" (`:129`).
- No stream-level test sends a failing tool through `runChatStream`.
  The spec's "fails that tool call. The run continues and the failure is visible" (§Tools, `:125-126`) is tested only
  below the stream (`libs/assistant/src/lib/conversation-runtime.test.ts:181`).

D9 — Improvement, Later. The tool list is asserted twice as a literal inventory.
Decision: fixed by item 15.

- `libs/assistant-react/src/lib/runs/prepare-run-request.test.ts:165-173` and
  `runs/use-run-orchestration.test.ts:335-344` each compare `request.tools` with an eight-name literal list, beside the
  registry check (`CHAT_TOOLS = Object.keys(ASSISTANT_TOOL_SPECS)`).
  A literal only detects a change, and each new tool must edit both files.

D10 — Improvement, Later. Comments and docs describe code that has moved on.
Decision: fixed by item 16.

- `libs/ai/src/lib/assistant-tool-executor.ts:22` says "Each fn may be sync (NAPI) or async (web SQLite)", and the sync
  arms at `:24-45` exist only for test fixtures (`assistant-tool-executor.test.ts:44-57`).
  Every NAPI method returns a Promise (`apps/electron/src/koloda-db.ts:5-6`).
- `agents/ADD-ASSISTANT-TOOL.md:126` says "NAPI `KolodaDb` (sync reads)".
- `libs/ai/src/lib/assistant-tools.ts:283-284` calls the event shape "planned for the engine protocol — hosts forward it
  unchanged".
  The protocol exists, and Electron flattens errors to text (`apps/electron/src/ai-ipc.ts:151-157`).
- `libs/ai-react/src/lib/ai-tool-activity.tsx:359` cites "commit 5 copy decision", a plan later sessions cannot open.
- `libs/ai/src/lib/assistant-tools.ts:264` repeats the 1–255 title rule as `max(255)`, with no pointer to
  `libs/app/src/lib/titles.ts:3` (`ENTITY_TITLE_MAX_LENGTH`).
  It cannot import it, because the root barrel must stay free of `@koloda/app` (`libs/ai/README.md`).

D11 — Improvement, Later. The Russian truncated output label uses a different word from the plain one.
Decision: fixed by item 17.

- `libs/ai-react/locales/ru/messages.po:178` `ai.chat.tool-activity.output` is "Результат", but `:182`
  `output-truncated` is "Вывод (сокращён)".
  The input pair is consistent ("Ввод" / "Ввод (сокращён)", `:154` and `:158`).

D12 — Product decision, Later. `list_templates` and `list_algorithms` return each note whole; `list_decks` previews them.
Decision: decided (open question 2); fixed by item 20.

- `libs/ai/src/lib/assistant-tools.ts:104-106` limits `list_decks` notes to 150 characters, so that a long deck list "cannot
  crowd the context".
  §Budgets (`docs/specs/ASSISTANT-DATA-ACCESS.md:188`) keeps the other reads whole, which includes the two other list
  tools.
- Twenty templates with full notes add about 20k characters to one result.

D13 — Product decision, Later. When the step budget runs out, the run ends as an ordinary success.
Decision: decided (open question 3); fixed by items 21 and 22.

- `libs/ai/src/lib/chat-stream.ts:49` stops after eight steps, and `runChatStream` returns normally.
  Nothing in the run record says the budget was hit.
  The spec says only "the run stops" (`docs/specs/ASSISTANT-DATA-ACCESS.md:129`).

## Open questions

- [x] 1. C11 — A card with an empty required field is accepted at proposal and fails at Add.
  Decided: reject it at proposal, so the model retries it in the same turn; a request that fails to reach the host
  returns its rows to idle; a per-card host error stays `error`. (Human, 2026-10-24: go with the recommendation.)
- [x] 2. D12 — `list_decks` previews notes at 150 characters; `list_templates` and `list_algorithms` return them whole.
  Decided: preview notes in `list_decks` and `list_templates`; `get_template` returns the full note; `list_algorithms`
  stays whole. (Human, 2026-10-24.)
- [x] 3. D13 — When the step budget ends a run, the run finishes as an ordinary success.
  Decided: record a visible reason on the run, and keep the status `success`. (Human, 2026-10-24.)
- [x] 4. D4 — A cancel during an `add_deck` write leaves the deck in place and marks the row failed.
  Decided: a user cancel shows its running tool rows as canceled, not failed; failure and interruption stay failed; the
  cache refresh is item 10. (Human, 2026-10-24.)
- [x] 5. Flow — `local` (the default) or `remote` (CI on every push)?
  Decided: `local`. (Human, 2026-10-24: go with the recommendation.)

## Plan

- [x] 1. Type the add mocks as the host's per-card response
  Goal: Every Add mock in the assistant tests resolves `{ insertedIds: [...] }`, a shape no host returns (C3).
  Type them as `InsertCardsResponse` from `@koloda/srs` (`libs/srs/src/lib/cards.ts:96`): an array with one
  `{ error? }` per sent card, in input order.
  Change the mocks at `libs/assistant-react/src/lib/ui/assistant-cards-table.test.tsx:35, 136, 149, 161, 171-174, 208, 243`
  and `libs/assistant-react/src/lib/ui/assistant-chat-integration.test.tsx:152`.
  Then add two cases to `assistant-cards-table.test.tsx`:
  (a) two selected cards, response `[{}, { error: { code: "not-found.cards.add.deck" } }]`: the first row settles
  `success`, the second `error`;
  (b) a rejected mutation: every selected card settles `error`, and no other row changes.
  Constraints: tests only. Do not change `ui/use-assistant-cards-table.tsx` in this item.
  Done when: `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner` passes, and
  `git grep -n insertedIds -- libs apps` finds nothing.
  Commit: Type the add mocks as the host's per-card response
  Depends on: none

- [x] 2. Settle Add from the mutation promise so statuses survive unmount
  Goal: In `libs/assistant-react/src/lib/ui/use-assistant-cards-table.tsx`, `handleAddCards` passes its settle and
  invalidate callbacks to `mutation.mutate` (`:130-148`).
  TanStack runs those callbacks only while the table is mounted, so a conversation switch or a route change drops them:
  statuses stay `pending`, and the deck and lessons queries are not invalidated (C1).
  Use `mutation.mutateAsync` in a `try`/`catch`, so the success and error settle and both invalidations run after unmount.
  Before each status write, skip it unless the run still holds the card that was sent at that index (same content, still
  `pending`).
  A retry on the same run id clears the run's cards (`state/conversation-run-lifecycle.ts:28-34`), and a late write would
  otherwise mark the new cards.
  Keep the selection reset (`toggleAllRowsSelected`) on the success path only.
  Constraints: `setAssistantCardStatusAtom` (`state/conversation-actions.ts:128-138`) keeps its contract: it writes by
  conversation id and does not reorder the list.
  Replace the test "settles add statuses on the originating conversation after switching away"
  (`ui/assistant-cards-table.test.tsx:170-205`), which keeps `SelectionProbe` mounted.
  The new case unmounts the table before the add resolves, then asserts that conversation A's row settles `success`, that
  the deck cards and lessons queries are invalidated (spy on the `QueryClient`), and that conversation B is unchanged.
  Add a case where the run restarts (cards cleared) before the add resolves: no status write lands.
  Done when: the assistant-react vitest command in item 1 passes, and the unmount case fails on the pre-change code.
  Manual verify: web: open a conversation whose reply proposed cards, press Add, switch to another conversation before it
  finishes, then come back.
  The rows read Success, not Pending, and the deck's card list includes the new cards without a reload.
  Commit: Settle Add from the mutation promise so statuses survive unmount
  Depends on: 1

- [x] 3. Show the unavailable notice when the write-target deck is gone
  Goal: `libs/assistant-react/src/lib/ui/assistant-cards-message.tsx:31-43` checks only the live template.
  A deleted write-target deck leaves Add enabled, because the renderer's `canAdd`
  (`ui/use-assistant-message-renderer.tsx:112`) reads the stored ids, and every selected card then fails with
  `not-found.cards.add.deck` and stays `error` (C2).
  Also query the live deck with `getDeckQuery(deckId)` from `queriesAtom`; it returns null for a missing deck on both hosts.
  Disable the query when `deckId` is null.
  Treat a missing deck like a missing template: the table renders read-only, and the unavailable notice replaces Add.
  Rename the flag if it now covers both (for example `isWriteTargetUnavailable`), and update the comment at `:39-41`.
  Spec: in `docs/specs/ASSISTANT-CARD-GENERATION.md`, §Card Display covers only the template; extend it to the deck.
  In §Adding Cards to Deck, the last line says add is unavailable only for a missing template; make it cover either.
  Tests: beside the template case (`ui/assistant-cards-table.test.tsx:114`), add the deck case, and add an
  `AssistantCardsMessage`-level case where the deck query resolves to null and the notice shows.
  Done when: the assistant-react vitest command in item 1 passes.
  Manual verify: web: generate cards into a deck, delete that deck in Decks, then return to the conversation.
  The table is read-only with the unavailable notice, there is no Add button, and no row is marked Error.
  Commit: Show the unavailable notice when the write-target deck is gone
  Depends on: none

- [x] 4. Remove cards-mode leftovers from the reducer and run payloads
  Goal: Two leftovers of cards mode (C5, C6).
  (a) `addCard` is in the reducer action table (`libs/assistant-react/src/lib/state/conversation-reducer.ts:30`, import
  `:12`), but only tests dispatch it.
  Production calls the module function `addCard` from `setToolCallResult` (`state/conversation-run-tools.ts:9`, `:149`).
  Remove the action-table entry and its import, and keep the function.
  Move the tests that dispatch `["addCard", …]` (`state/conversation-reducer-runs.test.ts:80-96, :819, :852`;
  `state/conversation-reducer-messages.test.ts:268`; `state/assistant-conversation-store.test.ts:535`) to seed cards through
  `setToolCallResult` with a `propose_cards` output, or through fixtures.
  (b) `submitTurn` and `startRun` payloads accept `templateFields` (`state/conversation-run-stream.ts:92`, `:106`), and
  `makeRun` takes it (`state/conversation-run-helpers.ts:18-29`).
  Nothing passes it: the only dispatch (`runs/use-run-orchestration.ts:160-169`) omits it.
  Remove the parameter from both payloads and from `makeRun`; a new run starts with `templateFields: null`.
  Constraints: keep the stored `run.templateFields` field and its schema (`persistence/conversation-persistence-schema.ts:175`,
  `:235`); the cards table reads it.
  Only the submit-time parameter goes.
  Done when: the assistant-react vitest command in item 1 passes; `git grep -n '"addCard"' -- libs apps` finds nothing; and
  `git grep -n templateFields -- libs/assistant-react/src ':!*.test.*'` shows no payload parameter.
  Commit: Remove cards-mode leftovers from the reducer and run payloads
  Depends on: none

- [x] 5. Pass the saved template fields to the cards table and serializer
  Goal: `makeHistoricalTemplate` (`libs/assistant-react/src/lib/state/assistant-messages.ts:77`) builds a whole `Template`
  with a sentinel id, so the cards table and `serializeGeneratedCards` can take a `Template` (C7).
  They read only `content.fields`.
  Make `serializeGeneratedCards` (same file) and the table (`ui/use-assistant-cards-table.tsx`, its `template` option and
  `:45`) take `TemplateFields`, the stored `run.templateFields`.
  `AssistantCardsMessage` (`ui/assistant-cards-message.tsx:10-19`) takes `templateFields: TemplateFields | null` for the
  columns, and keeps `templateId` for the live lookup, so no fake id remains.
  Delete `makeHistoricalTemplate` and its call sites (`state/assistant-messages.ts:120`,
  `ui/use-assistant-message-renderer.tsx:97`, `:224`).
  Drop the defensive `template.content?.fields || []` at `use-assistant-cards-table.tsx:45`.
  Constraints: history and copy output stay the same (ASSISTANT-CARD-GENERATION.md §Conversation History).
  Items 2 and 3 change the same files; build on them.
  Done when: the assistant-react vitest command in item 1 passes; `git grep -n makeHistoricalTemplate -- libs apps` and
  `git grep -n "01900000-0000-7000" -- libs apps` both find nothing.
  Commit: Pass the saved template fields to the cards table and serializer
  Depends on: 2, 3

- [x] 6. Inline the card insert payload and drop srs's AI dependency
  Goal: `ui/use-assistant-cards-table.tsx:118-122` calls `transformGeneratedCards([card], deckId, templateId)` once per card
  and flattens the result (C8).
  The helper (`libs/srs/src/lib/assistant-cards-generation.ts` and its test, exported at `libs/srs/src/index.ts:22`) is the
  only `@koloda/ai` import in `@koloda/srs` (`assistant-cards-generation.ts:1`).
  It is the reason for the dependency in `libs/srs/package.json:19`, and it spells out progress defaults that
  `insertCardSchema` already applies (`libs/srs/src/lib/cards.ts:20-29`).
  Build `{ deckId, templateId, content }` at the Add call site instead, the same shape manual add sends
  (`libs/srs-react/src/lib/cards/add-card.tsx:55`).
  Delete the helper, its test, the export, the `@koloda/ai` entry in `libs/srs/package.json`, and the README lines that name
  it (`libs/srs/README.md:11` and `:26`).
  Keep the "Does NOT own" line that names AI providers (`libs/srs/README.md:32`).
  Refresh `bun.lock` if the install changes it.
  Constraints: the ids come from the hook's existing `deckId` and `templateId` options.
  Done when: `git grep -n transformGeneratedCards -- libs apps` finds nothing; `git grep -n "@koloda/ai" -- libs/srs` finds
  nothing; `bun run check:workspace-deps` passes; the assistant-react and srs vitest commands pass.
  Commit: Inline the card insert payload and drop srs's AI dependency
  Depends on: 2

- [x] 7. Keep card selection in one spec section and cite headings in e2e
  Goal: (a) The initial-selection rule appears three times in `docs/specs/ASSISTANT-CARD-GENERATION.md` (C9): the Selection
  glossary entry (`:33`), §Card Display (`:86`), and §Card Selection (`:134`).
  Keep it in §Card Selection only, and drop the other two.
  (b) Both e2e twins cite spec line numbers that no longer point at their rules (C10):
  `apps/web-e2e/src/assistant-cards.spec.ts:102, 119, 124, 140, 211, 244` and
  `apps/electron-e2e/src/assistant-cards.spec.ts:103, 120, 125, 141, 212, 245`.
  Read the rule at each cited line first, then replace each `ASSISTANT-CARD-GENERATION.md:<n>` with the heading of the rule
  the test checks (§Card Selection, §Card Status, §Adding Cards to Deck, §Card Display, or §Retry), in both twins in one
  change.
  Constraints: docs and comments only.
  The twins stay identical except for transport and setup.
  `agents/FUNCTIONAL-SPECIFICATIONS.md` (§Formatting): the heading is the stable id.
  Done when: `git grep -n "ASSISTANT-CARD-GENERATION.md:[0-9]" -- apps` finds nothing; `diff` of the two twins shows the same
  differences as before the edit; and only §Card Selection states the initial-selection rule.
  Playwright is not run (`agents/VERIFY.md`).
  Commit: Keep card selection in one spec section and cite headings in e2e
  Depends on: 3

- [x] 8. Keep tool-row counts and titles when a long output is shortened
  Goal: The spec's §Visibility (`docs/specs/ASSISTANT-DATA-ACCESS.md:167-173`) requires a successful row to show how many
  came back, or the deck or template title (D1).
  `boundToolOutput` (`libs/assistant-react/src/lib/state/conversation-run-tools.ts:74-92`) replaces any output over 2,000
  characters with `{ isTruncated, itemCount, totalCards?, acceptedCount?, rejectedCount?, preview }`.
  `itemCount` is the top-level key count, so it is 1 for every list tool, and the title is dropped.
  The reducer stores that value on the live row too (`:64`).
  `toolCallSummaries` (`libs/ai-react/src/lib/ai-tool-activity.tsx:353-400`) reads arrays and strings a bounded record no
  longer has.
  Fix: in `boundToolOutput`, keep a top-level string `title` when present.
  Set `itemCount` to the length of the `decks`, `templates`, or `algorithms` array when the output has one, by name, not by
  key order; fall back to the key count when it has none.
  `itemCount` is read only to recognise the bounded shape (`ai-tool-activity.tsx:439`), so the new meaning breaks no reader.
  In `toolCallSummaries`, the three list tools then read `itemCount` from the bounded record, as the card tools already fall
  back to `acceptedCount`.
  Update the bounded-shape comment at `ai-tool-activity.tsx:428-434` to the real shape.
  Inputs use the same function (`:37`), so the input assertion at `state/conversation-reducer-runs.test.ts:189` changes too.
  Constraints: outputs under the cap are unchanged, and the 400-character preview stays.
  Tests: replace the string-payload case at `state/conversation-reducer-runs.test.ts:261-283` with a real `list_decks` output
  over the cap, and assert the stored `itemCount` equals the deck count.
  Assert that a `get_deck` output over the cap keeps its `title`.
  Add a case in `libs/ai-react/src/lib/ai-tool-activity.test.tsx` that renders a bounded `list_decks` record and expects the
  row to read "N decks".
  Done when: the assistant-react and ai-react vitest commands pass.
  Manual verify: web: ask the assistant to list the decks in a library with 14 or more decks.
  The tool row reads "N decks", not just the label; expanding it shows the "Output (truncated)" preview.
  Commit: Keep tool-row counts and titles when a long output is shortened
  Depends on: none

- [x] 9. Describe shortened tool rows and the budget glossary in the data spec
  Goal: (a) §Visibility of `docs/specs/ASSISTANT-DATA-ACCESS.md` (`:153-183`) must describe what the user sees (D2).
  An input or output over 2,000 characters is kept as a 400-character preview, labeled "Input (truncated)" or
  "Output (truncated)" (`state/conversation-run-tools.ts:71-72`; `ai-tool-activity.tsx:185-189`, `:222-237`).
  §Persistence (`:216-221`) covers only the crash case, and stays as it is.
  Item 23 adds the run-end rule to §Visibility.
  (b) The Core model glossary's Budgets entry (`:39-40`) restates three numbers, and §Budgets (`:184-199`) has four (D3).
  Replace the glossary's numbers with "caps on what a tool returns or accepts; see §Budgets", and keep the numbers in §Budgets.
  Constraints: docs only. Follow `agents/FUNCTIONAL-SPECIFICATIONS.md`: state each rule once, and add no Edge Cases section.
  Done when: the glossary has no numbers, and §Visibility states the shortened-row rule.
  Manual verify: none — spec text only.
  Commit: Describe shortened tool rows and the budget glossary in the data spec
  Depends on: none

- [x] 10. Refresh deck queries when a run ends with add_deck still writing
  Goal: A cancel during an `add_deck` write does not stop the host write, because the binder checks the signal only before the
  host call (`libs/ai/src/lib/assistant-tools.ts:315-320`).
  The runtime then drops the tool events (`libs/assistant/src/lib/conversation-runtime.ts:284-289`), so the reducer marks the
  call failed, and the deck cache refresh never runs, because `notifyAddDeckWritten`
  (`libs/assistant-react/src/lib/runs/add-deck-query-invalidation.ts`) refreshes only on a recorded success (D4).
  The deck exists while the decks list and the template and preset delete guards keep stale data
  (`libs/app-react/src/lib/app-providers.tsx:62`, `staleTime` 60 s).
  Fix in the engine's emit adapter (`libs/assistant-react/src/lib/runs/assistant-engine-instance.ts:26-29`): before the terminal
  event of a run is dispatched, if that run still has an `add_deck` call in `running` status, invalidate the same deck
  queries that `notifyAddDeckWritten` invalidates.
  Do not change the row's status here; item 23 does that (open question 4).
  The refresh fires when the run ends, which can be before the host commits the deck.
  It sees the deck only if the refetch queues behind the write.
  Desktop holds: the addon runs each NAPI call whole on one `koloda-db` worker thread, in call order
  (`apps/electron/src-rust/src/lib.rs:194`; `apps/electron/src/koloda-db.ts` header).
  Web does not yet: `addDeck` (`libs/db-sqlite/src/lib/decks.ts:28-46`) takes the SQLite lock three times (algorithm read,
  template read, insert), so a refetch can run between them and cache the old list for the 60 s `staleTime`.
  Run web `addDeck` inside `db.transaction`.
  It holds the lock for the whole call (`libs/db-sqlite/src/lib/db.ts:257-272`).
  Pass `tx` to `getAlgorithm`, `getTemplate`, and `getDeck` inside it, as `algorithms.ts:57` does.
  Calling the locked `db` inside the transaction would wait on its own lock.
  The result is unchanged; only the lock is held once.
  State the ordering assumption in the WHY beside the refresh.
  Constraints: the cache refresh stays in the shell, outside `libs/ai` and the binders (`agents/ADD-ASSISTANT-TOOL.md`).
  Read the run through `readConversationState`, which the adapter already passes.
  Done when: a test in `add-deck-query-invalidation.test.tsx` (or beside the emit adapter) drives a terminal event with an
  `add_deck` call still running and asserts the deck queries are invalidated; the existing cases still pass; and the
  assistant-react and db-sqlite vitest commands pass.
  Manual verify: none — the window is one local insert, and the unit test drives the emit path.
  Commit: Refresh deck queries when a run ends with add_deck still writing
  Depends on: none

- [x] 11. Skip an oversized card in deck reads instead of stopping
  Goal: `shapeGetDeckCardsOutput` (`libs/ai/src/lib/assistant-tools.ts:428-452`) stops at the first entry that does not fit
  the 8,000-character card budget (`break` at `:441`).
  A first card over the budget returns zero cards from a full deck, and a long card at position 3 hides every card after it
  (D5).
  Change the loop to skip an entry that does not fit and keep filling.
  `isCapped` (`listed.length < cards.length`) still tells the model the list is short, so nothing is dropped silently
  (`docs/specs/ASSISTANT-DATA-ACCESS.md` §Budgets).
  Skip, not cut: a cut card would show the model a card that does not exist in the deck.
  Tests: in `libs/ai/src/lib/assistant-tools.test.ts`, beside the get_deck_cards budget cases: (a) a first card over 8,000
  characters, then fitting cards: the fitting cards are listed, `isCapped` is true, and `totalCards` is the real size;
  (b) a long card at position 3 does not hide cards 4 and later.
  Done when: the libs/ai vitest command passes.
  Manual verify: none — model-facing shaping; the row's count (item 8) reports the cards that were listed.
  Commit: Skip an oversized card in deck reads instead of stopping
  Depends on: none

- [x] 12. Type the AI IPC data source from the NAPI mirror
  Goal: `apps/electron/src/ai-ipc.ts:26-40` declares a second, narrower `KolodaDb` (seven data methods plus
  `getAiProfileSecrets`).
  `apps/electron/src/data-ipc.ts:97` joins it to the real mirror with `db as KolodaDb & Parameters<typeof registerAiIpc>[0]`,
  a cast that compiles even when the members disagree (D6).
  Type `registerAiIpc`'s parameter as
  `Pick<KolodaDb, "getDecks" | "getTemplates" | "getAlgorithms" | "getCards" | "getCardCounts" | "getSettings" | "addDeck">`
  from `apps/electron/src/koloda-db.ts`.
  Intersect it with a named secrets type, `{ getAiProfileSecrets(profileId: string): Promise<unknown> }`.
  Delete the local `KolodaDb` type in `ai-ipc.ts`.
  Secrets stay off the mirror (its INVARIANT, `koloda-db.ts:8-11`).
  So `getAiProfileSecrets` reaches `db` only through a cast: the addon instance has it, and the mirror omits it on purpose
  (`data-ipc.ts:93-97`).
  Keep a cast at `data-ipc.ts:97`, narrowed to `db as KolodaDb & <the secrets type>`.
  The seven data methods then come from the mirror itself, so they cannot drift; the cast adds only the secrets method.
  If the compiler then reports a mismatch in `createChatToolExecutor` (`ai-ipc.ts:126-140`), fix the mapping there.
  Do not cast it away: that mismatch is the drift this item exists to catch.
  Done when: `nx run @koloda/electron:typecheck` and `nx run @koloda/electron:test:unit` pass.
  Manual verify: none — type-only change in the desktop host.
  Commit: Type the AI IPC data source from the NAPI mirror
  Depends on: none

- [x] 13. Delete the legacy dataAccess snapshot from runs and restore
  Goal: The `dataAccess` snapshot is still a run field and a restore schema, validated and tested, but nothing reads it (D7).
  Its submit-time injection was removed (`agents/ASSISTANT-MAP.md:55`).
  Remove the field from `libs/assistant-react/src/lib/state/conversation-types.ts:4` and `:75`; its schema in
  `persistence/conversation-persistence-schema.ts` (the `dataAccessManifestField` and `dataAccessSnapshotField` declarations at
  `:123-135`, the field at `:184`, and the copy at `:241`); and the comments at `state/conversation-run-lifecycle.ts:38` and
  `runs/prepare-run-request.ts:33`.
  Delete `libs/assistant-react/src/lib/runs/data-access.ts` and the tests that cover it: the `dataAccess` cases in
  `persistence/conversation-restore.test.ts` (about `:455-730`), `state/conversation-reducer-runs.test.ts:67-78` and `:1120-1133`,
  `runs/use-run-orchestration.test.ts:397-467`, and `runs/use-conversation-runs.test.ts:532-572`.
  Fix the stale comment at `libs/ai/src/lib/assistant-tools.ts:18` ("mirrors the v1 data-access manifest"), and the two
  `agents/ASSISTANT-MAP.md` rows (`:14`, "restore-only `dataAccess` snapshot types", and `:36`, "historical snapshots").
  Constraints: no shim and no migration (`agents/BACKWARDS-COMPATIBILITY.md`).
  Zod's object parsing drops the unknown key from stored rows, so check that the restore schema is not strict at the root.
  Add one restore case: a stored run with a malformed `dataAccess` value restores, and the key is dropped.
  Done when: `grep -rn "dataAccess\b\|DataAccessSnapshot\|DataAccessManifest" libs apps --include='*.ts' --include='*.tsx'`
  (ignoring `dist/`) finds nothing, and the assistant-react and ai vitest commands pass.
  Manual verify: web: reload with an existing conversation that has tool rows; its messages and tool rows restore.
  Commit: Delete the legacy dataAccess snapshot from runs and restore
  Depends on: none

- [x] 14. Test the tool stream's abort, step budget, and tool errors
  Goal: The `chat tool streaming` block in `libs/ai/src/lib/assistant-tools.test.ts` (`:910-1093`) has an abort case at `:1009`
  that passes whatever the code does (D8).
  Production executors never receive a signal (`AssistantToolExecutor`, `assistant-tools.ts:293`), but this test's executor
  settles on its own controller.
  Rewrite it with an executor that ignores the signal, as production does: the stream rejects with `AbortError`, and no
  `toolResult` event arrives.
  Add two cases: (a) a model that calls a tool on every step makes exactly eight model calls
  (`CHAT_TOOL_STEP_BUDGET = 8`, `libs/ai/src/lib/chat-stream.ts:17`), and the run resolves;
  (b) an executor that throws produces a `toolResult` with an error, and the model's next step answers.
  Constraints: keep the cases in `assistant-tools.test.ts`, where the fake-model harness lives (see Scope, Skipped).
  Done when: the libs/ai vitest command passes, and the new cases drive `runChatStream` with the block's fake model.
  Commit: Test the tool stream's abort, step budget, and tool errors
  Depends on: none

- [x] 15. Derive the chat tool list in tests from the registry only
  Goal: `libs/assistant-react/src/lib/runs/prepare-run-request.test.ts:165-173` and `runs/use-run-orchestration.test.ts:335-344`
  each compare `request.tools` with an eight-name literal list (D9).
  Delete both literal lists.
  Keep `expect(prepared!.request.tools).toEqual(CHAT_TOOLS)` at `prepare-run-request.test.ts:164` as the one home of the rule.
  Keep the check at `use-run-orchestration.test.ts:334` as a pass-through against `CHAT_TOOLS`.
  Done when: the assistant-react vitest command passes, and neither file lists the tool names as literals.
  Commit: Derive the chat tool list in tests from the registry only
  Depends on: none

- [x] 16. Drop sync tool data reads and fix the stale tool comments
  Goal: `AssistantToolDataSource` in `libs/ai/src/lib/assistant-tool-executor.ts:24-45` accepts sync returns
  (`Promise<X> | X`) only for the test fixtures (`assistant-tool-executor.test.ts:44-57`) (D10).
  Make each member async, and wrap the fixtures' values in async functions.
  Fix the comments that describe code that moved on:
  `assistant-tool-executor.ts:22` ("Each fn may be sync (NAPI) or async (web SQLite)": every host returns a Promise,
  `apps/electron/src/koloda-db.ts:5-6`);
  `agents/ADD-ASSISTANT-TOOL.md:126` ("NAPI `KolodaDb` (sync reads)");
  `libs/ai/src/lib/assistant-tools.ts:283-284` ("planned for the engine protocol": the protocol exists, and Electron flattens
  errors to text at `apps/electron/src/ai-ipc.ts:151-157`);
  `libs/ai-react/src/lib/ai-tool-activity.tsx:359` ("commit 5 copy decision": state the rule itself).
  Add a WHY to `max(255)` at `libs/ai/src/lib/assistant-tools.ts:264`: it repeats `ENTITY_TITLE_MAX_LENGTH`
  (`libs/app/src/lib/titles.ts:3`), which the root barrel cannot import (`libs/ai/README.md`).
  Constraints: comments and types only, plus the fixtures; no behavior change.
  Leave the comment at `ai-tool-activity.tsx:430-434` to item 8.
  Done when: the libs/ai vitest command passes, and `git grep -n "commit 5\|Each fn may be sync" -- libs apps agents` finds
  nothing.
  Commit: Drop sync tool data reads and fix the stale tool comments
  Depends on: none

- [ ] 17. Match the Russian truncated output label to the plain one
  Goal: In `libs/ai-react/locales/ru/messages.po`, `ai.chat.tool-activity.output-truncated` (`:182`) reads "Вывод (сокращён)",
  while `ai.chat.tool-activity.output` (`:178`) reads "Результат" (D11).
  Change `:182` to "Результат (сокращён)".
  The input pair is already consistent (`:154`, `:158`).
  Then compile both apps' catalogs per `agents/I18N.md`: `nx run @koloda/web:lingui-compile` and
  `nx run @koloda/electron-react:lingui-compile`.
  No extract is needed, because no message id changes.
  Done when: `git grep -n "Вывод (сокращён)" -- libs apps` finds nothing, including the compiled catalogs under
  `apps/*/src/app/locales`.
  Manual verify: Russian UI: expand a truncated tool row; the output label reads "Результат (сокращён)" and the input label
  reads "Ввод (сокращён)".
  Commit: Match the Russian truncated output label to the plain one
  Depends on: none

- [ ] 18. Reject a proposed card that leaves a required field empty
  Goal: A proposal keeps any card with one non-empty value (`libs/ai/src/lib/assistant-tools.ts:545-561`,
  `shapeProposedCardFields`).
  So a card with an empty required field is accepted, selected, and fails at Add with an icon-only error (C11).
  Decided (open question 1): reject it at proposal, so the model gets it back in the same turn through the existing
  rejection path.
  Reject the card in `shapeProposedCardFields` when any field whose `isRequired` is true has empty text.
  The template fields carry `isRequired` (`assistant-tools.ts:122`).
  The existing counting then sets `rejectedCount`.
  Replace the WHY at `:558`, which says required fields are a save-time check.
  The messages must then name the cause, or the model cannot fix the card.
  `proposeCardsRejectedMessage` (`:205-208`) gives the cause as "(empty, unmappable, or over the 200-card cap)".
  `PROPOSE_CARDS_RETRY_MESSAGE` (`:202-203`), sent when every card is rejected, asks only for the exact titles.
  Neither fits a card whose titles were right and whose required field was empty.
  Have `shapeProposedCardFields` report the titles of the empty required fields instead of a bare null.
  When any card was rejected for that, both messages name those titles and ask the model to fill them.
  Constraints: `libs/ai` shaping and its tests, plus the spec.
  Update the propose_cards cases in `libs/ai/src/lib/assistant-tools.test.ts` that assert the one-value rule (for example,
  `{ Front, Answer }` accepted with an empty required Back).
  Update the message assertions (`assistant-tools.test.ts:658`, `:696`, `:704`, `:746`, `:846`) to the new signatures.
  Keep the 200-card cap as it is.
  Spec: §How Cards Are Proposed states the required-field check once, at proposal; §Card Structure drops its save-time
  statement.
  Done when: the libs/ai vitest command passes; a proposal with an empty required field returns `rejectedCount` 1 and a
  message that names that field; a proposal with every required field filled is unchanged.
  Manual verify: web: in a deck whose template has a required second field, ask the assistant for cards without that field;
  no row with an empty required cell appears.
  Commit: Reject a proposed card that leaves a required field empty
  Depends on: none

- [ ] 19. Return rows to idle when Add's request fails
  Goal: `handleAddCards`'s `onError` (`libs/assistant-react/src/lib/ui/use-assistant-cards-table.tsx:143-147`) marks every
  selected card `error`.
  Decided (open question 1): a request that fails to reach the host is transient, so its rows go back to `idle`, still
  selected, and Add can be pressed again.
  Per-card errors in a host response (`onSuccess`, `result.error`, `:134-138`) stay `error`, which is terminal.
  Set `idle` in the catch path that item 2 introduces, and keep the selection, so `hasSelection` re-enables Add.
  Constraints: this changes the same handler that item 2 rewrites; build on item 2.
  Spec: §Adding Cards to Deck says "On a network error, all selected cards are marked as error". Change it to say the rows
  return to idle, so the user can add them again. §Card Status: say that error is terminal for per-card results.
  Tests: the rejected-request case added in item 1 now expects idle, selected rows and an enabled Add; the per-card error
  case still expects `error`.
  Done when: the assistant-react vitest command passes.
  Manual verify: none — a request failure cannot be forced by hand without breaking the app; the rejected-mutation test
  drives the branch.
  Commit: Return rows to idle when Add's request fails
  Depends on: 1, 2

- [ ] 20. Preview template notes in list_templates like deck notes
  Goal: `list_decks` cuts a note to 150 characters and sets `notesTruncated`, using
  `ASSISTANT_TOOL_NOTE_PREVIEW_CHAR_BUDGET` (`libs/ai/src/lib/assistant-tools.ts:106`; the preview is applied around `:465-471`).
  `list_templates` returns each note whole (`shapeListTemplatesOutput`, `:331-340`), so twenty templates with full notes add
  about 20k characters to one result (D12).
  Decided (open question 2): preview template notes in `list_templates` with the same budget and the same `notesTruncated` flag.
  `get_template` already returns the full note (`:401`).
  `list_algorithms` stays whole: presets are few, and there is no single-get tool.
  Constraints: reuse the list_decks preview logic rather than adding a second copy.
  Spec: §Budgets (`docs/specs/ASSISTANT-DATA-ACCESS.md:186-188`) says list_decks and list_templates cut notes at 150
  characters, get_template returns the full note, and list_algorithms returns notes whole.
  Tests: in `libs/ai/src/lib/assistant-tools.test.ts`, the "entity notes in tool output" cases (near `:1142-1160`): the
  list_templates case now expects a preview and `notesTruncated` for a long note; the get_template case is unchanged.
  Done when: the libs/ai vitest command passes.
  Manual verify: none — the change is in model-facing tool output; the user sees it only through the model's reply.
  Commit: Preview template notes in list_templates like deck notes
  Depends on: none

- [ ] 21. Carry the step-budget stop to the run as a note
  Goal: When the eight-step budget ends a tool run, the run finishes as an ordinary success
  (`libs/ai/src/lib/chat-stream.ts:49`, `stopWhen`; `runChatStream` returns normally, `:89-97`), and nothing records the stop (D13).
  Decided (open question 3): record a visible reason, and keep the status `success`.
  Steps:
  (1) Detect the stop in `runChatStream` by counting steps, not from the provider's finish reason.
  In `ai` 7.0.126, `streamText` starts another step only while every tool call has an output and the stop condition is unmet.
  Otherwise it emits `finish` with the last step's `finishReason` as the provider reported it, so do not rely on that value.
  Count `start-step` parts, and note whether the current step emitted a `tool-call`.
  The budget ended the run when the count reaches `CHAT_TOOL_STEP_BUDGET` and the last step emitted a tool call.
  Emit the stop only after the abort and error checks that follow the loop, so a failed or canceled stream never carries it.
  (2) Send it as a stream chunk.
  `ChatStreamChunk` (`libs/ai/src/lib/generation.ts:33`) has only text and reasoning kinds; add a kind for the budget stop.
  `AiStreamEvent` carries `ChatStreamChunk` as is (`libs/native-ipc/src/index.ts:160`), so Electron forwards the new kind.
  Update `apps/electron/IPC.md` (AI channels) in the same commit.
  Add the kind to `RunChunk` (`libs/assistant/src/lib/assistant-protocol.ts:45-50`).
  The runtime already forwards non-text chunks unchanged (`libs/assistant/src/lib/conversation-runtime.ts:245-255`).
  Map the kind to a reducer action in `libs/assistant-react/src/lib/runs/assistant-event-to-action.ts`.
  (3) Store it on the run as its own optional field, for example `stopNote: "step_budget"`.
  Do not add it to `RunTerminationReason`: `reason` means why a run did not finish, and three things enforce that.
  `InterruptedReason` is `Exclude<RunTerminationReason, "user">` (`state/conversation-types.ts:14`), so a new value would
  become a valid interrupt reason.
  `transitionRun` clears `reason` on complete (`state/conversation-run-lifecycle.ts:64`).
  The restore schema rejects any reason on a success run (`persistence/conversation-persistence-schema.ts:195-221`).
  The restore schema accepts the new field on a success run only.
  `transitionRun` clears it on fail, cancel, and interrupt.
  Otherwise a cancel that lands between the chunk and the completion would store a canceled run that restore rejects.
  Constraints: the note is metadata only and never enters the history sent to the model. Restore keeps it.
  Tests: the item 14 eight-call case asserts the stop chunk; a run that finishes in fewer steps emits none.
  The reducer stores the field from the chunk and clears it on cancel.
  Restore keeps it on a success run and rejects it on any other status.
  Done when: the vitest command for each lib touched passes (`libs/ai`, `libs/assistant`, `libs/assistant-react`, and
  `libs/native-ipc` if it has tests); `nx run @koloda/electron:typecheck` passes.
  Manual verify: none — the stop happens only at the step budget, which a person cannot reach reliably by hand. Item 22 owns
  the visible copy and its manual check.
  Commit: Carry the step-budget stop to the run as a note
  Depends on: 14

- [ ] 22. Show the step-budget note under the run's status
  Goal: With item 21 in place, a run that stopped at the step budget carries the note, but nothing shows it (D13).
  Render a note under the run's status line, in the same place as the other run-status copy, saying that the assistant
  stopped at its tool-step limit. The status itself stays `success`.
  Copy: add the message to `libs/ai-react/locales/en/messages.po` and `ru`, next to the `ai.chat.message.status.*` keys
  (`en/messages.po:80-96`), then compile both apps (`agents/I18N.md`).
  Spec: §Tools (`docs/specs/ASSISTANT-DATA-ACCESS.md:129`, "the run stops") and the status copy in
  `docs/specs/ASSISTANT-MESSAGES.md` (§Message States) name the note.
  Constraints: the note is UI only; it must not enter the history sent to the model.
  Tests: a render test of the status line with the budget reason, checking the en and ru labels.
  Done when: the libs/ai-react and libs/assistant-react vitest commands pass, and both app lingui compiles run.
  Manual verify: web: a run that reaches the step budget shows the note under its status; a finished run shows none.
  Reaching the budget by hand is unreliable. If no prompt does it, the render test stands in, and the human checks the ru copy.
  Commit: Show the step-budget note under the run's status
  Depends on: 21

- [ ] 23. Mark calls the user cancels as canceled, not failed
  Goal: When a user cancels a run, its running tool calls end as failed. The helper that does this is
  `state/conversation-run-helpers.ts:57-66`, and it runs for every termination (`state/conversation-run-lifecycle.ts:84-85`).
  That is accurate for an error and wrong for a cancel the user asked for. For `add_deck`, it also tells the user the deck was
  not created when it may have been (D4).
  Decided (open question 4): a user cancel shows its running calls as canceled. Failure and interruption keep failed.
  Steps: add `canceled` to the persisted tool-call status enum
  (`libs/assistant-react/src/lib/persistence/conversation-persistence-schema.ts:134`,
  `z.enum(["running", "success", "error"])`) and to the `ToolCallStatus` type (`state/conversation-types.ts`).
  Pass the helper the run's termination reason, and set `canceled` only for a user cancel.
  Render "Canceled" in `libs/ai-react/src/lib/ai-tool-activity.tsx` next to the existing failed copy
  (`ai.chat.tool-activity.failed`), with en and ru keys, then compile both apps.
  Spec: §Visibility (`docs/specs/ASSISTANT-DATA-ACCESS.md:153-183`): a call still running when the user cancels is marked
  canceled; one still running when the run fails or is interrupted is marked failed.
  §Persistence keeps the crash rule (failed).
  Constraints: restore keeps canceled rows as canceled; `add_deck`'s row follows the same rule.
  Tests: a reducer test for a cancel versus a failure; an ai-tool-activity test for the canceled label; a restore test for a
  canceled row.
  Done when: the libs/assistant-react and libs/ai-react vitest commands pass, and both lingui compiles run.
  Manual verify: web: cancel a run while a tool row still reads Running; the row reads Canceled, not Failed. If the call
  finishes too fast to catch by hand, the unit tests stand in.
  Commit: Mark calls the user cancels as canceled, not failed
  Depends on: none

## Outcome

Not yet. Filled at Done, with the skipped and needs-decision entries restated there (`agents/TASKS.md`, §Audit-sourced tasks).
