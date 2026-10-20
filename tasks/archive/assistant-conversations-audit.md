# Assistant conversations audit fixes

Status: done
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, agents/ASSISTANT-MAP.md, docs/specs/ASSISTANT-CONVERSATIONS.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/VERIFY.md, agents/BACKWARDS-COMPATIBILITY.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/MARKDOWN.md, agents/REVIEW.md, libs/assistant/README.md
Flow: local

## Intent

Settle every finding of the assistant conversations audit dated 2026-10-18.
It covered the behavior owned by `docs/specs/ASSISTANT-CONVERSATIONS.md`: runs, streaming, cancel, interruption,
history, AI profile state, persistence, restore, error handling, retry, and revert.
The audited commit was `a78223ac`.
Its report was `tmp/audits/assistant-conversations.md`, which git ignores.
This file restates every finding and its evidence, so neither the next session nor the archive reader needs it.
None of the audited files changed between `a78223ac` and `7b8e8c1c`, where this task branches.
Each finding was checked again at `7b8e8c1c`; triage corrected two of the report's claims (findings 8 and 11).

The report's verdict: the core is in good shape.
The engine, the per-conversation save queue, the transactional delete, the bounded shutdown flush, and the restore
boundary are correct and have strong gated-promise tests.
The defects sit where UI policy meets that core, and the tests there check payload shapes, not outcomes.

Triage also widened the task (questions 3 and 4).
Per `agents/BACKWARDS-COMPATIBILITY.md`, rows written by older builds are not read.
So restore drops every repair and tolerance that exists only for them (entries 17–19 below).
Such rows open on the recovery screen as corrupt.

Done when:

- with two failed runs, dismissing the error hides the panel until a new failure, and a reload keeps it hidden;
- Enter and the submit hotkey never clear the composer while the submit button is disabled;
- sending in a reverted conversation never deletes the hidden turns without starting a run;
- with no conversation open, changing the model or profile resets reasoning effort to the new model's default;
- a global record whose profile was deleted falls back to the newest profile once profiles load;
- the conversation that recovery reset creates is saved and stays in the sidebar;
- restore reads only the shape the current build writes, with no migration and no legacy repair;
- the legacy error-marker kind, the dead surface, the reducer re-exports, and `runStream` are gone;
- the spec and the code comments match the code;
- `bun run check:push` passes on the tip.

## Scope

Findings 1–16 are numbered as in the report; 17–19 were added at triage.
Line numbers are at `7b8e8c1c`.
Paths without a package prefix are under `libs/assistant-react/src/lib/`.

- 1. Spec violation, Must-fix: dismissing the newest stream error shows an older one, and the panel cannot be cleared.
  Decision: fixed by item 1.
  - `findLatestErroredRun` (`state/conversation-run-helpers.ts:110-119`) walks runs newest first and skips only the
    dismissed run, so it returns the next older failure.
  - `dismissRunError` (`state/conversation-session.ts:51-53`) stores a single id.
  - The report's probe: runs A and B both fail; the panel shows B; dismissing B shows A; dismissing A shows B again.
    After a reload the panel shows A, though A is not the latest failure.
  - Breaks §Error Handling ("shows the most recent error") and §Dismissing Errors ("stays hidden until a new failure
    occurs"; after reload, "the latest failure only if it was never dismissed").
  - `state/conversation-reducer-runs.test.ts:1068-1092` covers a single failed run only.
- 2. Spec violation, Must-fix: submitting while reverted with no resolved model deletes the hidden turns and starts
  no run.
  Decision: fixed by item 2.
  - `runs/use-run-orchestration.ts:142-145` dispatches `commitRevert`; `prepareRunRequest` runs only at :153.
    It returns `null` when `profileId` or `modelId` is empty (`runs/prepare-run-request.ts:43`), and the handler
    returns at :154.
  - The handler's own `// INVARIANT` at :132-134 says hidden messages must not be deleted unless a replacement run
    starts; only the empty-prompt case honors it, and only that case is tested (`use-run-orchestration.test.ts:628`).
  - The report's probe: reverted conversation, `modelId: ""`, submit "new prompt".
    No command is sent, `messages` is empty, `run-1` is gone, and the revert state is cleared.
  - Breaks §Relationships ("deletion of hidden turns happens only on the next submit") and §Starting a Run.
    Finding 3 makes it reachable from the UI.
- 3. Spec violation, Must-fix: Enter in the composer skips the submit button's checks; the prompt is cleared and
  nothing is sent.
  Decision: fixed by item 3.
  - `useAIChatInput.submit` (`libs/ai-react/src/lib/use-ai-chat-input.ts:33-41`) checks only `!!prompt && !isLoading`.
    It then calls `onSubmit(prompt)` and always clears the composer with `onChange("")`.
  - `AIChatPromptInput` calls that `submit` on Enter and on the `ui.submit` hotkey
    (`libs/ai-react/src/lib/ai-chat-prompt-input.tsx:19-34`), wired at `ui/assistant-chat.tsx:229`.
  - The button uses `useAIChatValidation` (`libs/ai-react/src/lib/use-ai-chat-validation.ts:26-36`,
    `ui/assistant-chat.tsx:156-164`), which also needs a profile, a model, required secrets, and a loaded model list.
  - While the model list loads or fails, `modelId` is `""` (`use-assistant-profile-selection.ts:96-100`).
    Enter reaches `handleGenerate`, which does nothing, and the text is gone.
    With missing secrets, Enter sends a run the button would block.
- 4. Spec violation, Should-fix: a model or profile change does not reset the parameters on the global record.
  Decision: fixed by item 4.
  - `profileChangeSync` and `modelChangeSync` (`state/ai-profile-sync.ts:19-31`) send `modelParameters: {}`.
    `useSetGlobalAIProfileState` (`use-global-ai-profile-state.ts:13-22`) applies parameters key by key, so `{}`
    deletes nothing.
  - The report's probe: a global record with `reasoning_effort: "high"` keeps it after `modelChangeSync` and after
    `profileChangeSync`.
  - With no conversation id, the composer reads parameters from the global record
    (`use-assistant-profile-selection.ts:56-60`).
    It keeps the stale effort whenever the new model supports that level (:108-113).
    A conversation created from that composer copies the stale value (`state/conversation-actions.ts:111-122`).
  - Breaks §AI Profile State ("If the model changes, model parameters are reset to that model's defaults").
  - `state/ai-profile-sync.test.ts:9-18` asserts that `{}` is sent, so it passes while the reset is broken.
- 5. Spec violation, Should-fix: the global record is not reconciled when its profile is gone, and
  `reconcileAIProfileState` has no caller.
  Decision: fixed by item 5.
  - `reconcileAIProfileState` (`state/ai-profile-state.ts:87-115`) implements §Global AI Profile State "Loading":
    a stored profile that is no longer available falls back to the newest profile, no model, and empty parameters.
  - Only its definition exists; no caller, no test.
    Its last caller, `useGlobalAIProfileState`, was removed as dead in `9186f217`.
  - The default effect fires only when no profile id is stored (`use-assistant-profile-selection.ts:79-94`).
    A deleted profile id stays selected, no model resolves, and submit stays disabled until the user picks a profile.
- 6. Spec violation, Should-fix: reset on the recovery screen creates a same-id conversation that is never saved.
  Decision: fixed by item 6.
  - `ui/assistant-conversation-recovery.tsx:81-90` deletes the row, invalidates the list, and runs `newConversation`,
    but nothing marks the conversation dirty; the comment at :73-74 says it "stays empty (and unwritten)".
  - The sidebar lists only saved rows, so the reset conversation drops off the list until the user types.
  - Breaks §Relationships ("saved once it has an identity, including when it has no messages") and §Restore.
  - `ui/assistant-chat-integration.test.tsx:1519` only checks a save after content is added.
- 7. Spec gap, Later: the spec does not describe two shipped behaviors.
  Decision: fixed by item 17.
  - The save-error panel has a Retry action (`ui/assistant-chat.tsx:226`, `retrySave`); §Save Errors describes only a
    dismissible panel.
  - Retry updates the global record (`runs/use-run-orchestration.ts:97`); §Global AI Profile State "When it is
    updated" lists only submitting a prompt and changing a value.
- 8. Risk, Later: unload and save-error rules lack tests, and a test file is misnamed.
  - 8a. Correction: the report said the bfcache `pagehide` branch (`runs/use-assistant-engine-host.ts:80`) had no test.
    Decision: no change needed.
    `ui/assistant-chat-integration.test.tsx:835`, "persisted pagehide/pageshow keeps the assistant available for a new
    run", covers it: no save, the run keeps streaming, the engine stays running, and a second run starts.
  - 8b. `runs/use-assistant-engine-host.test.ts` does not test `useAssistantEngineHost`.
    Its suites cover `deleteAssistantConversation` (:41), the write-adapter registry (:133), and the execution port
    (:204, :261), against TESTING.md (§Repetition and tables).
    Decision: fixed by item 12.
  - 8c. The §Save Errors rules have no test: an error that arrives after a switch is discarded, and a successful save
    clears the panel; `persistence/conversation-write-adapter.test.ts:149` only checks the failure write.
    Decision: fixed by item 13.
  - 8d. `runs/use-run-orchestration.test.ts:33`: `makeConfig` sets an `_` field that `AssistantConversationConfig` no
    longer has.
    Decision: fixed by item 2, which edits that file.
- 9. Improvement, Should-fix: stale docs in `@koloda/assistant`.
  Decision: fixed by items 11 and 16.
  - `libs/assistant/src/lib/assistant-protocol.ts:15-19`: the `RetryInput` doc describes a "data access snapshot
    replayed by retry … carried to the `runStarted` event"; the type has no such field.
    It invites the submit-time data-access injection that ASSISTANT-MAP.md (§Do not reintroduce) forbids.
  - `libs/assistant/src/lib/run-stream.ts:3-6` says chat "dispatches `updateAssistantText` … `setUsage`", but the
    README says "the engine never emits reducer tuples".
    Item 11 deletes the file.
  - `libs/assistant/README.md:12` lists a dependency on `@koloda/ai` for "card-proposal template shaping".
    The package imports only types (`ChatStreamRequest`, `ChatStreamChunk`, `StreamUsage`, `AssistantToolEvent`) and
    `toAIAppError` from `@koloda/ai/app-error`.
- 10. Improvement, Later: comments cite ASSISTANT-CONVERSATIONS.md sections that live in ASSISTANT-CONVERSATION-LIST.md.
  Decision: fixed by item 16.
  - `runs/use-assistant-session.ts:84` and `state/conversation-store.ts:167` cite §Unread Status.
  - `state/conversation-actions.ts:155` cites §Clone.
  - `ui/use-assistant-chat-hotkeys.ts:33` and `state/assistant-conversation-unread.test.ts:349` cite §Conversation List.
- 11. Improvement, Later: dead and test-only surface.
  Decision: fixed by item 14.
  - `assistantHasContextAtom` (`state/conversation-selectors.ts:34`) is used by tests only.
  - `ConversationSaveQueue.consecutiveFailures` and `.isTombstoned`
    (`libs/assistant/src/lib/create-conversation-save-queue.ts:58`, `:66`, `:142-143`, `:311`, `:315`) have no
    production reader; the host keeps its own tombstone set.
  - `useConversationSaveHost` returns `{ handleDismissSave }` (`persistence/use-conversation-save-host.ts:102`), but its
    only production caller discards it (`libs/app-react/src/lib/components/app.tsx:27`).
  - `IDLE_SAVE_DEBOUNCE_MS` is on the `@koloda/assistant` entry (`libs/assistant/src/index.ts:14`) only for tests.
  - `shutdownAssistantGracefully`'s `flushTimeoutMs` (`runs/use-assistant-engine-host.ts:25-27`) is passed only by
    `runs/use-conversation-runs.test.ts:650`.
  - Correction: the report said the queue throws `createWrite`'s `Promise<boolean>` away.
    The host does read it (`libs/assistant/src/lib/conversation-persistence-host.ts:65-67`), but only to hand it to the
    queue, which drops it (`create-conversation-save-queue.ts:175`).
    The boolean starts in `buildWriteConversation` (`persistence/conversation-write-adapter.ts:40`), so the fix spans
    three files.
- 12. Improvement, Later: `state/conversation-reducer.ts:25-29` acts as a barrel.
  Decision: fixed by item 15.
  - It re-exports `conversation-types` (`export *`), four helpers from `conversation-run-helpers`, and two from
    `conversation-run-tools`; 33 files import through it, against CODE-STYLE.md (§Avoid Reexports).
- 13. Improvement, Later: repairs for legacy rows live in the live reducer and engine.
  Decision: fixed by item 7, without any restore repair (question 3).
  - No live code creates the assistant `error` message kind; a failed run keeps its `chat-text` message.
  - Three live paths still branch for the marker or a missing run:
    `restartRun` re-creates a missing run (`state/conversation-run-lifecycle.ts:145-158`);
    `hasRetryableTurn` falls back on the marker (`state/conversation-run-helpers.ts:99-107`);
    the runtime retry gate lets a missing run through (`libs/assistant/src/lib/conversation-runtime.ts:455`).
  - The messages audit (2026-10-18, its finding 3) adds the renderer side: `renderErrorMessage` and `getErrorMetadata`
    are reached only by rows from older builds.
- 14. Improvement, Later: comments narrate history instead of marking traps.
  Decision: fixed by items 10, 11, and 16.
  - `libs/assistant/src/lib/conversation-runtime.ts`: :66-69 history note; stray `"` for an em dash at :71 and :131;
    the alias `takeCancelBeforeStart = takeRequestedReason` at :115; a redundant nested block at :238-241;
    a `runFailed` event at :171 that no longer exists.
  - `persistence/conversation-persistence-schema.ts`: :19-43 describes porting a "hand-rolled coercion in
    `conversation-persistence.ts`" that no longer exists; :79, :98, :131-136, and :340 refer to "pre-refactor" or
    "a previous port".
- 15. Improvement, Later: `runStream` (`libs/assistant/src/lib/run-stream.ts:8-31`) is a generic helper with four type
  parameters and one caller, `conversation-runtime.ts:232`.
  CODE-STYLE.md (§Change Discipline) warns against one-caller helpers.
  Decision: fixed by item 11 (question 2).
- 16. Improvement, Later: the spec says "revert state is not saved" four times.
  `docs/specs/ASSISTANT-CONVERSATIONS.md` :32 (Core model), :186 (§Persistence), :218 (§Restore), :284-285
  (§Revert State); FUNCTIONAL-SPECIFICATIONS.md (§Principles) wants one home per rule.
  Decision: fixed by item 17.
- 17. Legacy (new at triage; question 4): the v0 schema migration.
  Decision: fixed by item 8.
  - Rows without `schemaVersion` are read as v0 and healed by `migrateV0ToV1`
    (`persistence/conversation-schema-version.ts:43-98`).
  - Every current write stamps the version (`persistence/conversation-persistence.ts:55`).
- 18. Legacy (new at triage; question 4): message repairs at restore.
  Decision: fixed by item 9.
  - `backfillUserMessageRunIds` (`state/assistant-messages.ts:72-106`) stamps `runId` from `user-<id>` ids and heals
    `Date`, epoch, or missing `createdAt` values.
    Live `submitTurn` writes `{ createdAt: <ISO string>, runId }` (`state/conversation-run-stream.ts:20`).
    Both hosts return `state` as parsed JSON: web `JSON.parse`s it (`libs/db-sqlite/src/lib/parse-rows.ts:44`), and
    the desktop wire reviver leaves `state.*` alone (`apps/electron-react/src/app/ipc.ts:95`).
  - `liftLegacyReasoningParts` (`persistence/conversation-persistence.ts:181-212`) moves thinking stored as message
    parts onto the run; live thinking is recorded on the run.
  - The schema fails `generated-cards` kinds and `cards`-mode metadata as corrupt
    (`persistence/conversation-persistence-schema.ts:368-393`) and strips a historical `mode: "chat"` (:251-254,
    :363-366); live state has none of these.
- 19. Legacy (new at triage; question 4): field tolerances at restore.
  Decision: fixed by item 10.
  - Conversation fields accept missing or wrong-typed values the live state never holds:
    `activeRunId`, `profileId`, `modelId`, `lastReadRunId` (missing → `null`); `dismissedRunErrorId` (any type);
    `modelParameters` (null, missing, null entries); `promptInput` (missing → `""`).
  - Run fields: `modelName` (`null` → `undefined`); `error` (any value, details re-capped);
    `toolCalls` optional though `makeRun` always sets it (`state/conversation-run-helpers.ts:28`).
  - Activity fields: `startedAt` and `elapsedSeconds` optional though live activity always stamps both
    (`state/conversation-run-helpers.ts:40-47`); tool `input` and `error` re-bounded though live code bounds them
    when recording (`state/conversation-run-tools.ts:42`, `:62`).
  - `toDate` (`persistence/conversation-persistence-schema.ts:65-73`) accepts epoch numbers and `Date` instances.

Out:

- The sibling audit reports' findings: conversation list, messages, data access, and card generation.
  Item 7 takes the code side of the messages audit's finding 3.
  The messages audit's `docs/specs/ASSISTANT-MESSAGES.md` rewrite, which drops the error marker, stays with that
  report.
- The legacy `dataAccess` snapshot on runs (`state/conversation-types.ts:83`) stays with the data-access audit, as
  its finding 7 (question 5).
  Item 10 leaves the `dataAccess` schema alone.
- The conversation-list audit's finding 14 rewrites the recovery screen's delete path.
  Item 6 touches only the reset mutation.
- The messages audit's finding 2 edits the runtime text accumulator, which item 11 moves.
  Whichever lands second rebases.
- The messages audit notes that restore accepts a `null` run duration for any status, which only older rows reach.
  That stays with that report; item 10 leaves `elapsedSeconds` alone.
- Seen in passing, for the conversation-list slice: the desktop list query sends each conversation's full `state` over
  IPC to compute `hasTurns` (`apps/electron-react/src/app/queries.ts:67-73`).
  `ensureConversationId` (`runs/use-assistant-session.ts:105-121`) is a second path that creates a conversation.

## Open questions

- [x] 1. Flow? — `local` (human, 2026-10-20).
- [x] 2. Finding 15: inline `runStream`, or keep it until a second run kind exists? — inline it (human, 2026-10-20).
- [x] 3. Finding 13: repair legacy error-marker rows at restore, or in a v1→v2 migration? — neither.
  Legacy rows are ignored, per `agents/BACKWARDS-COMPATIBILITY.md`; delete the handling (human, 2026-10-20).
- [x] 4. The same rule reaches legacy-row handling the audit did not flag (entries 17–19).
  Remove it here, in a follow-up task, or keep it? — remove it here (human, 2026-10-20).
  Rows written before `schemaVersion`, or in an older shape, then open on the recovery screen.
- [x] 5. The legacy `dataAccess` snapshot is another report's finding (the data-access audit's 7).
  Take it here under question 4's rule, or leave it to that report? — leave it there (human, 2026-10-20).

## Plan

Paths without a package prefix are under `libs/assistant-react/src/lib/`.
Line numbers are at `7b8e8c1c`; when an earlier item moved them, find the code by its text.

- [x] 1. Keep a dismissed stream error from surfacing an older one
  Goal (finding 1):
  - `findLatestErroredRun` (`state/conversation-run-helpers.ts:110-119`) walks runs newest first and skips only the
    run whose id is `dismissedRunErrorId`, so it returns the next older failure.
    With runs A and B failed, dismissing B shows A, and dismissing A shows B again.
  - Rewrite it: find the newest run with `status === "failed"` and an `error`.
    Return `null` when that run is the dismissed one; never fall through to an older failure.
  - Keep `dismissRunError` storing one id; a restart already clears it (`state/conversation-run-lifecycle.ts:51`).
  - Add a case to `state/conversation-reducer-runs.test.ts`, next to the dismiss cases at :1068-1092.
    Runs r1 and r2 both fail, and the helper returns r2.
    After `dismissRunError` for r2 it returns `null`.
    After r3 then fails, it returns r3.
  Constraints: `conversation-run-helpers.ts` and that test file only.
  Done when:
  - `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner conversation-reducer-runs`
    passes, and the new case fails against the old helper;
  - Manual verify (web): use a profile with an invalid API key; in one conversation send two prompts so both runs fail.
    Dismiss the error: the panel stays hidden.
    Reload: still hidden.
    Send again: the new error shows.
  Commit: Keep a dismissed stream error from surfacing an older one
  Depends on: none

- [x] 2. Check the profile and model before committing a revert
  Goal (findings 2 and 8d):
  - In `handleGenerate` (`runs/use-run-orchestration.ts:116-187`), `commitRevert` runs at :142-145, before
    `prepareRunRequest` at :153.
    That returns `null` when `profileId` or `modelId` is empty (`runs/prepare-run-request.ts:43`).
    The handler then returns at :154 after the hidden turns were deleted for good, with no new run.
  - Call `prepareRunRequest` right after the empty-prompt check and before the revert commit.
    Pass `getVisibleMessages(currentState.messages, currentState.revertState)` and `currentState.runs`.
    That is the history the post-commit state gives: the commit drops exactly the hidden messages and their runs, and
    the history builder reaches runs only through messages.
    Return before `commitRevert` when it gives `null`, and use the result in the `try` block.
  - Nothing reads `currentState` after the commit any more; drop the re-read at :144 and make it `const`.
  - Widen the `// INVARIANT` at :132-134: every early return must come before `commitRevert`.
  - In `runs/use-run-orchestration.test.ts`, turn the case at :628 ("an empty submit in a reverted state keeps the
    hidden messages and revert state") into an `it.each` with three rows:
    an empty prompt; "new prompt" with `modelId: ""`; "new prompt" with `profileId: ""`.
    Each row asserts that the revert state, `run-1`, and both messages survive, and that no command is dispatched.
  - In the same file, drop the `_` field from `makeConfig` (:33); `AssistantConversationConfig` has no such field.
  Constraints: `use-run-orchestration.ts` and its test only; leave `prepare-run-request.ts` alone.
  Done when:
  - `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner use-run-orchestration`
    passes, and the no-model row fails against the old order;
  - `bun run typecheck` passes.
  Manual verify: none — item 3 makes the path unreachable from the UI; the hook test drives it.
  Commit: Check the profile and model before committing a revert
  Depends on: none

- [x] 3. Gate Enter in the assistant composer on the submit button's checks
  Goal (finding 3):
  - `useAIChatInput.submit` (`libs/ai-react/src/lib/use-ai-chat-input.ts:33-41`) checks only a non-empty prompt and
    `!isLoading`, then calls `onSubmit(prompt)` and always clears the composer.
  - `AIChatPromptInput` calls it on Enter and on the `ui.submit` hotkey
    (`libs/ai-react/src/lib/ai-chat-prompt-input.tsx:19-34`); `AssistantChat` wires it at `ui/assistant-chat.tsx:229`.
  - The submit button reads `useAIChatValidation` (`ui/assistant-chat.tsx:156-164`), which also needs a profile, a
    model, required secrets, and a loaded model list.
    While the model list loads or fails, Enter clears the text and sends nothing.
    With missing secrets, Enter sends a run the button would block.
  - Make one gate:
    - `UseAIChatInputOptions` takes `canSubmit: boolean` in place of `isLoading`.
      `submit` returns without calling `onSubmit` or `onChange` when it is false.
    - Drop `prompt` and `canSubmit` from `UseAIChatInputReturn`; nothing reads them after this change.
    - In `AssistantChat`, call `useAIChatValidation` before `useAIChatInput`, with `prompt: promptInput.trim()`.
      Pass its `canSubmit` into `useAIChatInput`, so Enter, the hotkey, and the button read one value.
  - Add `libs/ai-react/src/lib/use-ai-chat-input.test.ts` (`renderHook`):
    with `canSubmit: false`, `submit()` calls neither `onSubmit` nor `onChange`;
    with `canSubmit: true`, it calls `onSubmit` with the trimmed prompt and `onChange("")`.
  Constraints: `use-ai-chat-input.ts`, its new test, and `assistant-chat.tsx`.
  Leave `useAIChatValidation` and `AIChatPromptInput` alone.
  `useAIChatInput` has no other caller.
  Done when:
  - `bunx vitest run --config libs/ai-react/vitest.config.mjs --configLoader runner use-ai-chat-input` passes, and the
    blocked case fails against the old hook;
  - `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner` passes;
  - `bun run typecheck` and `bun run lint` pass;
  - Manual verify (web):
    - AI route, a profile whose model list fails to load (for example a bad base URL) → type a prompt, press Enter →
      the text stays and no message is added;
    - the same with the submit hotkey;
    - a working profile → Enter sends the prompt and clears the composer.
  Commit: Gate Enter in the assistant composer on the submit button's checks
  Depends on: none

- [x] 4. Reset global model parameters on a profile or model change
  Goal (finding 4):
  - With no conversation id, the composer reads parameters from the global AI profile record
    (`use-assistant-profile-selection.ts:56-60`).
  - `profileChangeSync` and `modelChangeSync` (`state/ai-profile-sync.ts:19-31`) send `modelParameters: {}`, and
    `useSetGlobalAIProfileState` (`use-global-ai-profile-state.ts:13-22`) merges key by key, so nothing is cleared.
    A stored `reasoning_effort: "high"` survives both changes and stays whenever the new model supports it.
  - Spec: ASSISTANT-CONVERSATIONS.md (§AI Profile State), "If the model changes, model parameters are reset to that
    model's defaults".
  - Make profile and model changes replace the global record:
    - `profileChangeSync` and `modelChangeSync` return a full `AIProfileState` as `global`.
    - `handleModelProfileChange` (`use-assistant-profile-selection.ts:118-132`) writes it with
      `useSetAtom(aiProfileStateAtom)`.
    - Parameter edits (`parameterChangeSync`) and run start (`useRememberLastUsedAIProfile`) keep the merge.
  - Replace the payload-shape tests in `state/ai-profile-sync.test.ts`, which pass while the reset is broken.
    Delete that file.
    - Add `use-assistant-profile-selection.test.tsx` at the lib root.
      Drive the real hook: a Jotai store whose `queriesAtom` has `getAIProfilesQuery` and whose `aiRuntimeAtom` has
      `listModels`, inside a `QueryClientProvider`.
      Do not `vi.mock` `@koloda/ai-react`: this lib runs with `isolate: false` (TESTING.md §Runner constraints).
      Clear the `koloda:global-ai-profile-state` localStorage key between tests.
      With no current conversation and a global record holding `reasoning_effort: "high"`:
      a model change clears the stored parameters;
      a profile change clears them;
      a parameter edit changes only that key and keeps the profile and model.
    - Add `use-global-ai-profile-state.test.ts`: `useRememberLastUsedAIProfile` updates the profile and model and keeps
      the stored parameters.
  Constraints: `ai-profile-sync.ts`, `use-assistant-profile-selection.ts`, and the tests.
  Leave the default-profile effect (`use-assistant-profile-selection.ts:79-94`) to item 5.
  Done when:
  - `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner profile` passes, and the
    model-change case fails against the old merge;
  - `bun run typecheck` passes;
  - Manual verify (web): AI route with no conversation open → pick a model with reasoning levels, set effort to High →
    pick another model that supports High → the effort shows that model's default.
    Send a prompt: the new conversation keeps that default.
  Commit: Reset global model parameters on a profile or model change
  Depends on: none

- [x] 5. Reconcile the global AI profile record when its profile is gone
  Goal (finding 5):
  - Spec: ASSISTANT-CONVERSATIONS.md (§Global AI Profile State), "Loading".
    A stored value whose profile is no longer available is reconciled to defaults: the newest profile, no model, and
    empty parameters.
  - `reconcileAIProfileState` (`state/ai-profile-state.ts:87-115`) implements that rule but has no caller.
  - The default effect (`use-assistant-profile-selection.ts:79-94`) fires only when no profile id is stored.
    A deleted profile id stays on the global record, no model resolves, and submit stays disabled.
  - Replace the effect's global (no-conversation) branch with a reconcile.
    Once the profiles query has succeeded, write `reconcileAIProfileState(globalAIProfileState, profiles)` to
    `aiProfileStateAtom` when the record is null, has no profile id, or names a profile not in `profiles`.
    - Do not reconcile while profiles load or after the query failed: the empty list would wipe a valid profile.
      `useAIProfiles` returns the whole query, so `isSuccess` is there.
    - Skip the write when the reconciled value equals the stored one, so an empty profile list cannot loop.
    - Keep the conversation branch (`setAIProfile` when the open conversation has no profile).
  - Add cases to `use-assistant-profile-selection.test.tsx` (item 4), with no current conversation:
    - a record naming a deleted profile, with parameters, becomes the newest profile with no model and empty parameters
      once profiles load, and the hook returns that profile id;
    - a record naming an existing profile is left as is;
    - while the profiles query is held on a gated promise, the record is untouched;
    - with no record, the newest profile is written.
  Constraints: `use-assistant-profile-selection.ts` and its test; `reconcileAIProfileState` keeps its signature.
  Done when:
  - `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner profile` passes, and the
    deleted-profile case fails without the reconcile;
  - `bun run typecheck` passes;
  - Manual verify (web): AI route with no conversation open → select profile B → delete B in AI settings → back on the
    AI route the picker shows the newest remaining profile, a model resolves, and submit is enabled once text is typed.
  Commit: Reconcile the global AI profile record when its profile is gone
  Depends on: 4

- [x] 6. Save the conversation that recovery reset creates
  Goal (finding 6):
  - Reset on the recovery screen (`ui/assistant-conversation-recovery.tsx:81-90`) deletes the blocked row and runs
    `newConversation` under the same id, but nothing marks it dirty.
    So it is never saved and drops off the sidebar until the user types.
  - Spec: ASSISTANT-CONVERSATIONS.md (§Relationships), "saved once it has an identity, including when it has no
    messages"; (§Restore), "Reset replaces it with a fresh empty conversation under the same identity".
  - After `newConversation`, set `touchConversationAtom` with the id (`state/conversation-store.ts:145`).
  - Rewrite the end of the WHY at :67-74, which says the conversation "stays empty (and unwritten)".
    Say it is saved at once, like any conversation with an identity.
  - In `ui/assistant-chat-integration.test.tsx`, next to "recovery reset: the fresh conversation saves normally once
    content is added" (:1519), add a case.
    After a reset with no content, `wire.setConversationCalls` gets a write for that id once the idle save runs.
  Constraints: the reset mutation and its comment only.
  The conversation-list audit's finding 14 rewrites the delete path; leave it.
  Done when:
  - `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner assistant-chat-integration`
    passes, and the new case fails without the touch.
  Manual verify: none — reaching the recovery screen needs a hand-corrupted row; the integration test drives the real
  reset.
  Commit: Save the conversation that recovery reset creates
  Depends on: none

- [x] 7. Drop the legacy error-marker message kind
  Goal (finding 13, plus the messages audit's finding 3 code side; question 3):
  - No live code creates the assistant `error` message kind; a failed run keeps its `chat-text` message.
    Only rows from older builds carry it.
    Those rows are ignored, per `agents/BACKWARDS-COMPATIBILITY.md`: no restore repair and no migration.
  - Delete the kind and every branch that reads it:
    - `{ kind: "error" }` in `AssistantMessageMetadata` and its check in `isAssistantMetadata`
      (`state/assistant-messages.ts:6`, `:35`);
    - `getErrorMetadata` (`state/assistant-messages.ts:116-118`) and the history builder's skip (:209);
    - `renderErrorMessage` and its branch (`ui/use-assistant-message-renderer.tsx:44-45`, `:133-139`);
    - `applyRetryAssistantKind` and the missing-run recreate in `restartRun`
      (`state/conversation-run-lifecycle.ts:123-159`); a restart of a missing run is a no-op;
    - the marker fallback in `hasRetryableTurn` (`state/conversation-run-helpers.ts:99-107`); no run, not retryable;
    - the missing-run pass in the runtime retry gate (`libs/assistant/src/lib/conversation-runtime.ts:450-466`).
      A retry whose run is missing returns before the restart, like a non-retryable status.
      Drop the comment line "Missing runs proceed (restore-dropped error-marker recreate)".
  - Tests:
    - Delete the cases whose subject is the marker or the recreate.
      In `state/conversation-reducer-runs.test.ts` they are :972, :1035, :1095, and :1165.
      In `state/assistant-messages.test.ts` it is the `getErrorMetadata` case at :82-87.
    - Where a case uses the marker only as setup, rewrite the fixture to `chat-text` with a failed run.
      Those are `conversation-reducer-runs.test.ts:999`, `assistant-messages.test.ts:136`, and
      `runs/prepare-run-request.test.ts:71`.
    - Turn `conversation-reducer-runs.test.ts:1061` into "a restart of a missing run is a no-op".
      Merge it with :1161 if they then assert the same thing.
    - Turn `libs/assistant/src/lib/conversation-runtime.test.ts:329` ("retries a missing run") into: a retry whose run
      is missing makes no provider call.
  - A legacy row that still holds the marker restores as a plain assistant message without retry; that is accepted.
  Constraints: assistant-react `state/` and `ui/use-assistant-message-renderer.tsx`, `@koloda/assistant`
  `conversation-runtime.ts`, and their tests.
  Leave `docs/specs/ASSISTANT-MESSAGES.md`; its rewrite belongs to the messages audit.
  Done when:
  - `grep -rn 'kind: "error"\|kind === "error"' libs/assistant-react/src libs/assistant/src` finds nothing;
  - `bun run typecheck` and `bun run lint` pass;
  - `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner` and
    `bunx vitest run --config libs/assistant/vitest.config.mjs --configLoader runner` pass.
  Manual verify: none — no live path creates the marker; failed-run retry is unchanged and stays covered by tests.
  Commit: Drop the legacy error-marker message kind
  Depends on: none

- [x] 8. Drop the v0 conversation schema migration
  Goal (entry 17; question 4):
  - Rows without `schemaVersion` are read as v0 and healed by `migrateV0ToV1`
    (`persistence/conversation-schema-version.ts:43-98`).
    Every current write stamps the version (`persistence/conversation-persistence.ts:55`).
    Rows from older builds are not read.
  - Replace `migratePersistedConversation`, `SchemaMigration`, `migrateV0ToV1`, and `MIGRATIONS` with a version check,
    named for what it does:
    - a non-object row is corrupt;
    - a row whose `schemaVersion` is an integer above `CONVERSATION_SCHEMA_VERSION` is `unsupportedVersion`, as now;
    - anything else goes on to the schema.
      Its `schemaVersion: z.literal(CONVERSATION_SCHEMA_VERSION)` (`persistence/conversation-persistence-schema.ts:345`)
      already fails a missing, older, or malformed version as corrupt.
  - Update `coerceConversationState` (`conversation-persistence-schema.ts:459-488`) to the new result.
    Drop the `malformed-version` branch if the schema now reports that case.
  - Keep the `// INVARIANT` that a future version never loads into live state.
    Keep the WHY on telling missing, future, and corrupt rows apart.
  - Tests:
    - `persistence/conversation-schema-version.test.ts`: delete the v0 cases (:55, :71).
      Keep the current-version, future-version, and non-object cases in the new shape.
    - `persistence/conversation-restore.test.ts`: most `coerceConversationState` fixtures omit `schemaVersion` and pass
      only through the v0 path.
      Add one builder for a stored row of the current version and use it in those fixtures.
      Items 9 and 10 build on it.
      Add a case: a row without `schemaVersion` is corrupt.
      Rework the cases under "schemaVersion and strict lifecycle validation" (:1109-1200) that rely on the v0 heal.
    - Every other test that feeds a stored row to restore must stamp the version.
      These include `getConversationQuery` in `ui/assistant-chat-integration.test.tsx` and
      `persistence/use-conversation-restore.test.tsx`.
      Find the rest with `grep -rn 'getConversationQuery\|coerceConversationState' libs/assistant-react/src`.
  - Spec, ASSISTANT-CONVERSATIONS.md (§Restore): after "If the saved conversation is corrupt or was written by a newer
    version of the app, restore is blocked", add that a conversation saved in a shape this version no longer reads is
    treated as corrupt.
  - `agents/ASSISTANT-MAP.md`: the `persistence/` folder row says "`schemaVersion` migrations"; say "`schemaVersion`
    check".
  Constraints: `conversation-schema-version.ts`, the version branch of `conversation-persistence-schema.ts`, the spec
  sentence, the map row, and tests.
  Done when:
  - `grep -rn 'migrateV0ToV1\|MIGRATIONS' libs` finds nothing;
  - `bun run typecheck`, `bun run lint`, and `bun run check:markdown` pass;
  - `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner` passes.
  Manual verify: none — only rows from older builds reach this path; the restore tests cover it.
  Commit: Drop the v0 conversation schema migration
  Depends on: none

- [x] 9. Drop legacy message repairs from conversation restore
  Goal (entry 18; question 4).
  Each repair below rewrites a shape no current writer produces:
  - `backfillUserMessageRunIds` (`state/assistant-messages.ts:72-106`), called from `normalizeRestoredConversation`
    (`persistence/conversation-persistence.ts:126-135`).
    It stamps `runId` from `user-<id>` ids and heals `Date`, epoch, or missing `createdAt` from the paired run.
    - Live `submitTurn` writes `{ createdAt: <ISO string>, runId }` (`state/conversation-run-stream.ts:20`).
    - Both hosts return `state` as parsed JSON: web `JSON.parse`s it (`libs/db-sqlite/src/lib/parse-rows.ts:44`), and
      the desktop wire reviver leaves `state.*` alone (`apps/electron-react/src/app/ipc.ts:95`).
    - Delete the function and its call.
      Narrow `coerceCreatedAtToIso` (`state/assistant-messages.ts:13-27`) to ISO strings, and drop its WHY about wire
      revival and legacy rows.
  - `liftLegacyReasoningParts` and `isReasoningPart` (`persistence/conversation-persistence.ts:177-212`, call at
    :137-141).
    Older builds stored thinking as message parts; live thinking is recorded on the run's activity list.
    Delete them.
  - The schema's marker rejections and mode fields:
    - the `superRefine` that fails `generated-cards` kinds and `cards`-mode metadata
      (`persistence/conversation-persistence-schema.ts:368-393`);
    - `mode: z.enum(["chat"]).optional()` on runs (:251-254) and on conversations (:363-366).
    - Live state has no mode and no such kinds.
      Delete them; zod strips unknown keys, and a leftover marker restores as a plain message.
    - Fix the WHY on `messageShape.metadata` (:59-61), which says the `superRefine` inspects those kinds.
  - Normalize keeps:
    - streaming runs becoming interrupted;
    - pending card statuses reset;
    - running activity closed;
    - dangling `dismissedRunErrorId` and `lastReadRunId` pointers cleared.
  - Tests:
    - Delete the cases that pin a removed repair: `persistence/conversation-restore.test.ts` :531, :542, :546, :564,
      :1458, :1659, and :1700; the backfill cases in `state/assistant-messages.test.ts` (:54-76).
    - Also delete the two `deckId` cases in `conversation-restore.test.ts` (:137, :576).
      No code handles a conversation `deckId`; they only pin that a key from older builds is not kept.
    - Fixtures that give user messages a `Date` or epoch `createdAt`, or no `runId`, get the live shape.
  Constraints: `persistence/conversation-persistence.ts`, `persistence/conversation-persistence-schema.ts`,
  `state/assistant-messages.ts`, and their tests.
  Done when:
  - `grep -rn 'backfillUserMessageRunIds\|liftLegacyReasoningParts\|generated-cards' libs/assistant-react/src` finds
    nothing;
  - `bun run typecheck` and `bun run lint` pass;
  - `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner` passes.
  Manual verify: none — only rows from older builds reach these paths.
  Commit: Drop legacy message repairs from conversation restore
  Depends on: 7, 8

- [x] 10. Restore conversation fields in the shape the current build writes
  Goal (entry 19, and finding 14's schema part; question 4).
  Each tolerance below accepts or heals a shape no current writer produces.
  Make `persistence/conversation-persistence-schema.ts` accept the live shape only:
  - Conversation fields (:343-367):
    - `activeRunId`, `profileId`, `modelId`, and `lastReadRunId` use `optionalString`, which maps a missing value to
      `null`; live state always holds `string | null`.
      Use `z.string().nullable()`.
    - `dismissedRunErrorId` accepts any type (:352); use `z.string().nullable()`.
    - `modelParameters` accepts null, a missing map, and null entries (:106-121).
      Live state is a string map with empty values deleted (`state/conversation-session.ts:42-49`).
      Use a plain string record.
    - `promptInput` maps a missing value to `""` (:357-362); require a string.
  - Run fields (:248-282):
    - `modelName` maps `null` to `undefined` (:123-127); use `z.string().optional()`.
    - `error` takes any value and re-caps `details` (:142-152).
      Live errors are `{ message, details? }`, with details bounded by the runtime
      (`libs/assistant/src/lib/conversation-runtime.ts:535-537`).
      Validate that shape, optional.
      Then drop `boundRunErrorDetails` from the `@koloda/assistant` entry (`libs/assistant/src/index.ts:10`) if nothing
      else imports it there.
    - `toolCalls` is optional (:273-276), though `makeRun` always sets it (`state/conversation-run-helpers.ts:28`).
      Make it required in the schema and in `AssistantRun` (`state/conversation-types.ts:62-68`).
      Drop the `?.` and `?? []` on it (about nine non-test reads).
  - Activity fields (:213-234):
    - `startedAt` and `elapsedSeconds` are optional (:213-216); live activity always stamps both
      (`activityTiming` and `stampActivityElapsed`, `state/conversation-run-helpers.ts:40-47`).
      Make them required in the schema and in `RunToolCall` and `RunReasoningActivity`
      (`state/conversation-types.ts:22-50`), and drop the WHY comments that call them optional.
    - Tool `input` and `error` are re-bounded on restore (:221-231); live code bounds them when recording
      (`state/conversation-run-tools.ts:42`, `:62`).
      Use `z.unknown()` and `z.string().optional()`.
  - Timestamps: `toDate` (:65-73) accepts epoch numbers and `Date` instances.
    Both hosts return ISO strings inside `state` (item 9).
    Accept ISO strings only.
    First check what `setQueryConversation` caches (`persistence/conversation-write-adapter.ts:80`); if a cached row can
    carry `Date` instances back into restore, keep `Date` and drop only the epoch branch.
  - Keep these, but replace their legacy rationale with the live one:
    - `writeTargetDeckId` and `writeTargetTemplateId` are optional because a live run sets them only once
      `propose_cards` succeeds (:277-281; `state/conversation-types.ts:69-74`).
    - `activityField` (:245) is a union because live tool calls carry no `kind` and reasoning rows do.
  - Finding 14, schema part: rewrite the history comments, keeping the trap each one protects.
    These are the header (:19-43), "Restore previously cast" (:45-54), "pre-refactor" (:78-79, :96-98), "A previous
    port" (:129-136), and "pre-refactor no validation gate" (:337-342).
  - Leave `dataAccess` to the data-access audit's finding 7, and `elapsedSeconds` on runs as it is.
  - Tests in `persistence/conversation-restore.test.ts`:
    - Delete the cases that pin a removed tolerance: :259 (epoch `createdAt`), :269 (missing AI fields default), the
      omitted-value rows of the `lastReadRunId`, `promptInput`, and `modelName` tables (:309, :341, :378), :798, :850,
      :905, :955, :966, :1097, and :1524.
    - Keep :395 ("strips legacy request") only if it still pins that unknown keys are stripped; otherwise delete it.
    - Add table rows: a missing `promptInput`, `profileId`, or `toolCalls`, or a non-string `dismissedRunErrorId`,
      fails as corrupt.
  - Fixtures anywhere that build runs or activity without `toolCalls` or timers now fail the type check; give them the
    live shape.
  Constraints: `persistence/conversation-persistence-schema.ts`, `state/conversation-types.ts`, readers of the now
  required fields, `libs/assistant/src/index.ts`, and tests.
  The persisted shape (`toPersistedState`) does not change, so `CONVERSATION_SCHEMA_VERSION` stays 1.
  Done when:
  - `grep -rn 'rows saved before\|pre-refactor\|previous port' libs/assistant-react/src` finds nothing;
  - `bun run typecheck` and `bun run lint` pass;
  - `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner` and
    `bunx vitest run --config libs/assistant/vitest.config.mjs --configLoader runner` pass;
  - Manual verify (web): a conversation with tool activity, reasoning, and a failed run → reload → the messages, the
    activity rows with their durations, and the error panel all come back.
  Commit: Restore conversation fields in the shape the current build writes
  Depends on: 8, 9

- [x] 11. Inline runStream into the chat run
  Goal (finding 15, and the `run-stream.ts` parts of findings 9 and 14; question 2):
  - `runStream` (`libs/assistant/src/lib/run-stream.ts:8-31`) has four type parameters and one caller, `runChatRun` in
    `conversation-runtime.ts` (call at :232).
    Its doc (:3-6) says chat dispatches reducer actions, but the engine never emits reducer tuples.
  - Inline it in `runChatRun`: a local accumulated-text variable, the transport body, then the finalize body, then
    `handleStreamResult(conversationId, streamResult, runId)`.
    Keep event order and behavior, and keep each WHY and INVARIANT comment with the code it guards.
  - While moving the transport body, flatten the redundant nested block at :238-241.
  - Delete `run-stream.ts`; keep `stream-result.ts`.
  - `libs/assistant/README.md`: drop "and the shared stream funnel" (:4) and the "Stream funnel" entry (:60).
  - `agents/ASSISTANT-MAP.md`: drop `run-stream.ts` from the "Fix streaming / chunk handling" row.
  Constraints: `@koloda/assistant` source plus those two docs.
  No behavior change; existing runtime and engine tests pass unchanged.
  Done when:
  - `bunx vitest run --config libs/assistant/vitest.config.mjs --configLoader runner` passes;
  - `grep -rn 'runStream\|run-stream' libs agents` finds nothing;
  - `bun run typecheck`, `bun run lint`, and `bun run check:markdown` pass.
  Manual verify: none — refactor with no behavior change.
  Commit: Inline runStream into the chat run
  Depends on: 7

- [x] 12. Split the engine host test file by subject
  Goal (finding 8b):
  - `runs/use-assistant-engine-host.test.ts` does not test `useAssistantEngineHost`, against TESTING.md (§Repetition
    and tables).
    Its suites test:
    - `deleteAssistantConversation` (:41), defined in `persistence/conversation-write-adapter.ts`;
    - `registerAssistantPersistenceWriteAdapter` (:133), in `runs/assistant-persistence-host.ts`;
    - the execution port (:204, :261), in `runs/assistant-execution-port.ts`.
  - Move each suite unchanged into the file named for its subject:
    `persistence/conversation-write-adapter.test.ts` (exists), `runs/assistant-persistence-host.test.ts` (new), and
    `runs/assistant-execution-port.test.ts` (new).
    Carry the fixtures and the `beforeEach` or `afterEach` setup each suite needs.
  - Delete `runs/use-assistant-engine-host.test.ts`.
    The hook's unload rules are tested through the shell harness in `ui/assistant-chat-integration.test.tsx`:
    plain `pagehide` (:766), bfcache `pagehide`/`pageshow` (:835), and after leaving the route (:1120).
  Constraints: test files only; no assertion changes.
  Done when: `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner` passes with the
  same test count as before the move.
  Commit: Split the engine host test file by subject
  Depends on: none

- [x] 13. Test the save-error discard and clear rules
  Goal (finding 8c):
  - Spec: ASSISTANT-CONVERSATIONS.md (§Save Errors) says an error that arrives after the user switched conversations is
    discarded.
    §Dismissing Errors says save errors are cleared by a successful save.
  - `buildWriteConversation` (`persistence/conversation-write-adapter.ts:33-108`) does both.
    It sets the save status only while the written id is current (:79-84, :97-104), and a success sets `error: null`.
    The only test is the failure write (`persistence/conversation-write-adapter.test.ts:149`).
  - Add two cases there, with `setSaveStatus` writing the real `saveStatusAtom` on the test store:
    - a save of A whose `setConversationFn` is held on a gated promise; the current id switches to B; the write rejects;
      the save status is unchanged;
    - a failed save of A sets an error; a later successful save of A leaves `error: null` and `isDismissed: false`.
  Constraints: that test file only.
  Done when: `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner
  conversation-write-adapter` passes, and each case fails when its guard in `buildWriteConversation` is removed.
  Commit: Test the save-error discard and clear rules
  Depends on: 12

- [x] 14. Delete dead assistant persistence and selector surface
  Goal (finding 11).
  Each item was checked with `grep -rn '\b<name>\b' libs apps --include='*.ts' --include='*.tsx'`, ignoring `dist/` and
  tests.
  - `assistantHasContextAtom` (`state/conversation-selectors.ts:34`) has no production reader.
    Delete it and its assertion in `state/assistant-conversation-store.test.ts` (:13, :622).
  - `ConversationSaveQueue.consecutiveFailures` and `.isTombstoned` have no production reader
    (`libs/assistant/src/lib/create-conversation-save-queue.ts:58`, `:66`, `:142-143`, `:311`, `:315`).
    Delete them; keep `failureAttempt` and `hasTombstone`, which the queue uses itself.
    In `create-conversation-save-queue.test.ts`, drop the assertions on them (:194, :214, :226, :276, :293, :320,
    :328).
    Write counts, retry timing, and `logSaveFailure`'s `attempt` already pin that behavior.
    Reword the comments that name `consecutiveFailures` in `conversation-persistence-host.test.ts` (:166, :190).
  - `useConversationSaveHost` returns `{ handleDismissSave }` (`persistence/use-conversation-save-host.ts:15-17`,
    `:31`, `:102`).
    Its only production caller discards it (`libs/app-react/src/lib/components/app.tsx:27`); the chat gets dismiss
    from `useConversationPersistence`.
    Return `void`, and delete `UseConversationSaveHostReturn` and the hook's `dismissSaveStatus`.
  - Remove `IDLE_SAVE_DEBOUNCE_MS` from the `@koloda/assistant` entry (`libs/assistant/src/index.ts:14`).
    The assistant-react tests that import it from the entry use a local `const IDLE_SAVE_DEBOUNCE_MS = 250`.
    Tests inside `@koloda/assistant` keep importing it from `./create-save-scheduler`.
  - Drop the `flushTimeoutMs` parameter of `shutdownAssistantGracefully` (`runs/use-assistant-engine-host.ts:25-27`).
    Pass `SHUTDOWN_FLUSH_TIMEOUT_MS`.
    Its only other caller, `runs/use-conversation-runs.test.ts:650`, passes `0`.
    If that test then waits on the real budget, drive it with fake timers; do not keep the parameter for the test.
  - The durable write's `Promise<boolean>` is never read: the queue awaits `write()` and drops the value
    (`create-conversation-save-queue.ts:175`).
    It passes through the host (`libs/assistant/src/lib/conversation-persistence-host.ts:15`, `:63-67`) from
    `buildWriteConversation` (`persistence/conversation-write-adapter.ts:40`).
    Make all three `Promise<void>`, with bare `return` for the early exits.
    Update the test doubles that resolve booleans.
  Constraints: delete, with no shims (`agents/BACKWARDS-COMPATIBILITY.md`).
  Done when:
  - the grep above finds no production reader for any removed name;
  - `bun run typecheck` and `bun run lint` pass;
  - `bunx vitest run --config libs/assistant/vitest.config.mjs --configLoader runner` and
    `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner` pass.
  Manual verify: none — dead code removal.
  Commit: Delete dead assistant persistence and selector surface
  Depends on: 12

- [x] 15. Import conversation reducer helpers from their defining files
  Goal (finding 12):
  - `state/conversation-reducer.ts:25-29` re-exports `conversation-types` (`export *`).
    It also re-exports `dropRuns`, `findLatestErroredRun`, `getVisibleMessages`, and `hasRetryableTurn` from
    `conversation-run-helpers`, and `boundToolError` and `boundToolOutput` from `conversation-run-tools`.
    That breaks CODE-STYLE.md (§Avoid Reexports).
  - About 33 files import from `conversation-reducer`.
    Point each re-exported name at its defining file.
    Names the reducer defines (`conversationReducer`, `ConversationReducerAction`) keep their import.
    Delete the re-export lines.
  - `agents/ASSISTANT-MAP.md`:
    - the "Change conversation history rules" row names `state/conversation-reducer.ts` (`getVisibleMessages`); point
      it at `state/conversation-run-helpers.ts`;
    - the "Change run lifecycle" row names `transitionRun`, `submitTurn`, and `rollbackSubmitTurn` under the reducer;
      point them at `state/conversation-run-lifecycle.ts` and `state/conversation-run-stream.ts`.
  Constraints: import lines and those two map rows only.
  Match each file's import style, with `import type` on its own line.
  Done when:
  - `conversation-reducer.ts` has no `export *` or `export { … } from`;
  - `bun run typecheck`, `bun run lint`, `bun run check:markdown`, and
    `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner` pass.
  Manual verify: none — import paths only.
  Commit: Import conversation reducer helpers from their defining files
  Depends on: 7, 10, 14

- [x] 16. Correct stale assistant docs, spec pointers, and history comments
  Goal (findings 9, 10, and the runtime part of 14):
  - Finding 9:
    - Delete the `RetryInput` doc (`libs/assistant/src/lib/assistant-protocol.ts:15-19`).
      It describes a "data access snapshot replayed by retry … carried to the `runStarted` event" that the type does
      not have.
      It invites the submit-time data-access injection that ASSISTANT-MAP.md (§Do not reintroduce) forbids.
    - `libs/assistant/README.md:12` says the package depends on `@koloda/ai` for "card-proposal template shaping".
      It imports only stream, request, and tool-event types, plus `toAIAppError` from `@koloda/ai/app-error`.
      Say that instead.
  - Finding 10: retarget these to `ASSISTANT-CONVERSATION-LIST.md (§…)`; the headings exist there:
    - `runs/use-assistant-session.ts:84` and `state/conversation-store.ts:167`: §Unread Status;
    - `state/conversation-actions.ts:155`: §Clone;
    - `ui/use-assistant-chat-hotkeys.ts:33` and `state/assistant-conversation-unread.test.ts:349`: §Conversation List.
  - Finding 14, in `libs/assistant/src/lib/conversation-runtime.ts` (CODE-DOCUMENTATION.md allows WHY, INVARIANT, and
    WORKAROUND tags and short orientation docs, not history):
    - :66-69: drop the history ("Replaces the four previously separate … slots"); keep the INVARIANT.
    - :71 and :131: replace the stray `"` with an em dash.
    - :115: delete the alias `takeCancelBeforeStart = takeRequestedReason` and call `takeRequestedReason`.
    - :171: the comment names a `runFailed` event that no longer exists.
      The transport catch emits `runTerminated` with a failed outcome; say that.
  Constraints: comments and docs, plus the alias at :115; no behavior change.
  Items 7 and 11 move the runtime lines; find them by text.
  Done when:
  - `grep -rn 'runFailed\|takeCancelBeforeStart' libs/assistant/src` finds nothing;
  - `bun run typecheck`, `bun run lint`, and `bun run check:markdown` pass;
  - `bunx vitest run --config libs/assistant/vitest.config.mjs --configLoader runner` passes.
  Manual verify: none — comments and docs only.
  Commit: Correct stale assistant docs, spec pointers, and history comments
  Depends on: 7, 11

- [x] 17. Spec save-error retry and retry's global profile update
  Goal (findings 7 and 16), in `docs/specs/ASSISTANT-CONVERSATIONS.md`:
  - §Save Errors (:238-242) describes only a dismissible panel.
    The panel also offers Retry, which saves the conversation again.
    Check what `retrySave` does in `persistence/use-conversation-persistence.ts` and describe it from the user's side.
  - §Global AI Profile State, "When it is updated" (:175-179), lists submitting a prompt and changing a value.
    Retrying a run also updates the global record with the conversation's current profile and model; stored parameters
    stay (`runs/use-run-orchestration.ts:97`).
    Add it as a third case.
  - The rule that revert state is not saved appears at :32 (Core model), :186 (§Persistence), :218 (§Restore), and
    :284-285 (§Revert State).
    Keep it only in §Revert State:
    - Core model defines the term without the persistence rule.
    - Delete the sentence in §Persistence.
    - In §Restore, replace "Revert state is cleared" with a pointer to §Revert State.
  Constraints: this spec only.
  Follow FUNCTIONAL-SPECIFICATIONS.md and MARKDOWN.md, with no code references in the spec.
  Done when:
  - only §Revert State says that revert state is not saved;
  - `bun run check:markdown` and `bun run check:format` pass.
  Manual verify: none — spec text only.
  Commit: Spec save-error retry and retry's global profile update
  Depends on: 8

## Outcome

Shipped, one commit per Plan item:

- The error panel picks the newest failed run and stays hidden once that run's error is dismissed.
- Submit checks the profile and model before committing a revert, so hidden turns are deleted only when a run starts.
- Enter, the submit hotkey, and the submit button share one gate (`useAIChatInput` takes `canSubmit`).
- Profile and model changes replace the global AI profile record; parameter edits and run start still merge.
- With no conversation open, a global record whose profile is missing is reconciled to the newest profile once the
  profile list has loaded.
- Recovery reset marks the fresh conversation dirty, so it is saved while empty.
- Restore reads only the shape the current build writes:
  - no `error` message kind, missing-run recreate, or marker fallback in retry;
  - no v0 migration: a row without the current `schemaVersion` is corrupt, a newer one is `unsupportedVersion`;
  - no user-message `runId`/`createdAt` backfill, reasoning-part lift, `generated-cards`/`cards`-mode rejection, or
    `mode` stripping;
  - no defaults or repairs for conversation, run, and activity fields; timestamps are ISO strings only;
  - `AssistantRun.toolCalls` and activity `startedAt`/`elapsedSeconds` are required in the live types.
- `runStream` is inlined into the chat run; `run-stream.ts` is gone.
- The engine host test file is split into files named for their subjects; the save-error discard and clear rules have
  tests.
- Dead surface is deleted: `assistantHasContextAtom`, the queue's `consecutiveFailures` and `isTombstoned`, the save
  host's return value, `IDLE_SAVE_DEBOUNCE_MS` and `boundRunErrorDetails` on the `@koloda/assistant` entry,
  `shutdownAssistantGracefully`'s `flushTimeoutMs`, and the durable write's boolean result.
- `conversation-reducer.ts` no longer re-exports; importers use the defining files.
- Stale docs, spec pointers, and history comments are corrected.
- ASSISTANT-CONVERSATIONS.md describes save-error Retry and retry's global update, says rows in an older shape are
  corrupt, and keeps the unsaved-revert rule only in §Revert State.

Beyond the item text:

- Item 4 replaced the chat integration test's file-level `vi.mock("@koloda/ai-react")` with seeded query data.
  Under `isolate: false` that mock collided with the new profile hook test: 14 integration failures in a full run.
- Item 7 also deleted `getChatTextMetadata`, which became a passthrough.
  Three engine test fixtures stored runs without a status and now carry one.
- Item 8 folded the version check into `coerceConversationState` and deleted `conversation-schema-version.test.ts`;
  the restore tests cover its cases.
- Items 9 and 10 also deleted `isUserMessageMetadata`, `UserMessageMetadata`, `ensureActivity`, and the two
  `deckId` tests; restore now rejects `reason: null`.
  The restore test helpers JSON-round-trip each fixture, as both hosts deliver stored rows.
- Item 14 also changed `AssistantPersistenceWriteAdapter.writeConversation` to `Promise<void>`.

Checks on the branch:

- Scoped Vitest per item; at the tip `@koloda/assistant-react` 475, `@koloda/assistant` 75, `@koloda/ai-react` 66.
- `bun run test:app-unit` passed after item 14.
- `bun run check:push` passed on the tip before Archive.
- assistant-react passed with one worker, with a cold results cache, and in six shuffled orders of the files that
  mock `@koloda/ai-react`.

Left open:

- Finding 8a: no change needed; the bfcache `pagehide` path is already covered.
- The legacy `dataAccess` snapshot stays with the data-access audit (its finding 7; question 5), together with its
  "rows saved before data access" schema comment.
- `ASSISTANT-MESSAGES.md` still describes the error marker; that rewrite is the messages audit's finding 3.
- Seen while working, not fixed:
  - `assistant-conversations-list.test.tsx` fails in some shuffled file orders: `useLingui` runs without its file
    mock. It reproduces on `7b8e8c1c`.
  - `use-run-orchestration.test.ts` casts a submit payload to a type with a `mode` field that no longer exists;
    `tsc -b` excludes test files, so stale test types go unnoticed.
  - `use-assistant-message-renderer.test.tsx` and `assistant-cards-message.test.tsx` mock `@koloda/ai-react` at file
    level; every probed order passed.
- Manual verify (web) was handed to the human: dismissing with two failures, Enter while the model list fails,
  effort reset on a model change, a deleted global profile, and reload of a conversation with tool activity.
