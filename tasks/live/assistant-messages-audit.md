# Assistant messages audit fixes

Status: ready
Guides: agents/IMPLEMENTATION-PLAN.md, agents/TASKS.md, agents/ASSISTANT-MAP.md, docs/specs/ASSISTANT-MESSAGES.md, docs/specs/ASSISTANT-CONVERSATIONS.md, docs/specs/ASSISTANT-CARD-GENERATION.md, agents/CODE-STYLE.md, agents/CODE-DOCUMENTATION.md, agents/TESTING.md, agents/VERIFY.md, agents/CSS.md, agents/I18N.md, agents/BACKWARDS-COMPATIBILITY.md, agents/FUNCTIONAL-SPECIFICATIONS.md, agents/MARKDOWN.md, agents/REVIEW.md
Flow: local

## Intent

Settle every finding of the assistant messages audit dated 2026-10-18.
It covered the behavior owned by `docs/specs/ASSISTANT-MESSAGES.md`: message kinds, how a turn displays (text,
activity rows, mixed card turns, status), message states, reasoning rows, copy and send time, and revert, revert
again, restore, and re-trigger.
The audited commit was `a78223ac`.
Its report was `tmp/audits/assistant-messages.md`, which git ignores.
This file restates every finding and its evidence, so neither the next session nor the archive reader needs it.

The audit ran before the assistant conversations fixes (`26603f61..d32fb02e`) and the conversation list fixes
(`..5801f741`) landed.
Triage checked each finding again at `5801f741`, where this task branches.

- Thirteen findings still hold; only line numbers moved.
- Finding 10's failing order was fixed by `8400cfe9` (conversation list task, item 1).
- Finding 3's code side shipped in `ee682737` (conversations task, item 7); its spec side is left here.
- Finding 13's trailing `continue` went with `ee682737`; the rest of 13 holds.

The report's verdict: the display core is sound.
The pending status lives in one predicate, reasoning shares the activity list with tools in arrival order, the mixed
card turn renders in the specified order, and copy reuses the history serialization.
Each has focused reducer or widget tests.
The defects sit in revert, in stream text assembly, and in a spec that no longer matches the code.

Done when:

- revert, revert again, then Restore puts back the draft typed before the first revert;
- a reload during a revert puts back that draft too;
- text before and after a tool call reads as two paragraphs, on screen and in the history sent to the AI;
- an empty `<think>` block opens no Thought row;
- the Russian Thinking and Thought labels differ;
- a success run without a saved duration keeps its activity rows and copy action;
- typing in the composer and streaming into the tail do not re-render finished turns' activity rows and card tables;
- ASSISTANT-MESSAGES.md has no error marker, states each rule once, and describes copy and the user message time;
- the cards message status ladder, `modelName` on chat messages, and the `interrupted` part are gone;
- `bun run check:push` passes on the tip.

## Scope

Findings 1–15 are numbered as in the report.
Line numbers are at `5801f741`.
Paths without a package prefix are under `libs/assistant-react/src/lib/`.

- 1. Spec violation, Must-fix: revert, revert again, then Restore loses the user's draft.
  Decision: fixed by item 1.
  - The chat shell passes the live composer text to `controller.revert` and sets the composer to the returned
    pre-fill (`ui/assistant-chat.tsx:155-166`).
  - `handleRevert` always stores that text as `preRevertInputText`, even when a revert is already active
    (`runs/use-run-orchestration.ts:184-207`).
    `setRevertState` replaces the whole revert state (`state/conversation-session.ts:99-102`).
  - So the second revert holds the first revert's pre-fill, or the user's edit of it, as the pre-revert text.
    `handleRestore` (`runs/use-run-orchestration.ts:209-216`) returns that pre-fill.
  - The report's probe: draft "my draft", revert to turn 2 (composer "Second"), revert to turn 1 (composer "First"),
    Restore.
    The composer gets "Second", not "my draft".
  - Breaks §Re-trigger ("Any text the user had typed in the input before the revert is held in the revert state")
    and §Restore ("Restore returns the prompt input to its pre-revert state").
  - `state/conversation-reducer-revert.test.ts:119` ("updates the revert point without deleting anything") asserts
    at :191-197 that a re-revert replaces `preRevertInputText`, which pins the bug.
    The web e2e revert scenario reverts once, from an empty composer, so it cannot see this.
- 2. Spec violation, Should-fix: text before and after a tool call runs together, on screen and in history.
  Decision: fixed by item 3.
  - `libs/ai/src/lib/chat-stream.ts:57-59` forwards only `text-delta` parts; text-block and step boundaries are
    dropped.
  - The runtime accumulates `text += chunk.text` (`libs/assistant/src/lib/conversation-runtime.ts:257`).
    `updateAssistantText` keeps one text part (`state/conversation-run-stream.ts:40-56`).
    So the paragraph join in `getTextMessageContent` (`libs/ai/src/lib/conversations.ts:3-9`) never sees more than
    one part on a live message.
  - The report's probe: a two-step tool run whose steps say "Let me check your decks." and "You have 2 decks." ends
    with one text part, "Let me check your decks.You have 2 decks.".
    The history sent to the AI carries the same run-on string.
  - Breaks §Message Content: "Separate text segments of a response read as separate paragraphs, on screen and in the
    history sent to the AI."
- 3. Spec violation, Should-fix: the spec describes an error-marker message that no code creates.
  Decision: spec side fixed by item 10; code side shipped in `ee682737`.
  - ASSISTANT-MESSAGES.md says an error marker is "Created when a run fails or when a failed run is restored.
    The message text is cleared to empty" (:55-57).
    It relies on the marker at :23, :31, :80, :123, :136, :146, and :153.
  - A failed run keeps its `chat-text` message and partial text.
    `grep -rn 'kind: "error"\|kind === "error"\|renderErrorMessage\|getErrorMetadata' libs apps` over TS and TSX,
    ignoring `dist/`, finds nothing.
  - The spec also contradicts itself: §Message States says a failed run keeps its partial content (:105-106).
- 4. Spec violation, Should-fix: an empty `<think>` block opens an empty Thought row.
  Decision: fixed by item 4.
  - `appendAssistantReasoning` drops only `""` deltas (`state/conversation-run-stream.ts:64`).
    A whitespace-only delta opens a row, and `libs/ai-react/src/lib/ai-tool-activity.tsx:141-173` renders the header
    for any row.
  - The report's probe: the stream `<think>\n\n</think>\n\nAnswer.` through the real extraction middleware yields a
    reasoning delta `"\n\n"`, and the run gets a Thought row whose fold is blank.
    Qwen-style local models emit exactly this when thinking is off.
  - Breaks §Message Content: "Empty reasoning is not shown."
  - `state/conversation-reducer-messages.test.ts:215-219` covers only the `""` delta.
- 5. Spec violation, Should-fix: in Russian, the Thinking and Thought labels are the same.
  Decision: fixed by item 5; wording taken at triage (question 3).
  - `libs/ai-react/locales/ru/messages.po:194-199`: both `ai.chat.tool-activity.thinking` and
    `ai.chat.tool-activity.thought` are "Размышление".
  - Breaks §Message Content ("While the model is thinking, the row is labeled Thinking.
    When thinking finishes, the row is labeled Thought.") for Russian users; only the shimmer changes.
- 6. Spec violation, Should-fix: §Message States omits retry on canceled runs.
  Decision: fixed by item 10.
  - ASSISTANT-MESSAGES.md:107-108 lists only "A canceled status indicator" for canceled.
    :105-106 and :109-110 name a retry button for failed and interrupted.
  - ASSISTANT-CONVERSATIONS.md (§Retry): "The user can retry a failed, canceled, or interrupted run."
  - The renderer shows retry on canceled tail turns (`ui/use-assistant-message-renderer.tsx:164-173`), and
    `libs/ai-react/src/lib/ai-chat-message-status.test.tsx:50` pins it.
  - The per-state list restates a rule whose home is §Retry; FUNCTIONAL-SPECIFICATIONS.md (§Principles) wants one home
    per rule.
- 7. Spec violation, Later: the spec does not describe copy or the user message time.
  Decision: fixed by item 12.
  - Every user message has a copy action and a send time (`ui/use-assistant-message-renderer.tsx:65-83`).
    `ui/message-timestamp.tsx:9-21` shows "Today, <time>" for today and the full date and time otherwise.
  - Assistant copy holds the serialized cards, then leftover text (`ui/use-assistant-message-renderer.tsx:221-228`).
    It appears only in a finished status row (:152-176).
  - ASSISTANT-CARD-GENERATION.md:100 refers to "the message copy action", but no spec defines copy for chat turns or
    user messages.
    INTERFACE-SETTINGS.md:127 lists "chat message times" among formatted timestamps without saying where they show.
- 8. Spec violation, Later: a circular pointer, restated rules, and a stray line.
  Decision: fixed by item 11.
  - ASSISTANT-MESSAGES.md:32-33 points at ASSISTANT-CARD-GENERATION.md (§Card Display) for the mixed-turn order.
    ASSISTANT-CARD-GENERATION.md:88 points back at ASSISTANT-MESSAGES.md (§Message Display).
  - The mixed-turn order is stated at :32, :73-75, :79, and :114.
    The pending rule is stated at :76-78 and again at :98-102.
  - :111 sits directly under a list with no blank line, so Markdown folds it into the "interrupted" bullet.
    It also restates ASSISTANT-CONVERSATIONS.md (§Restore) on elapsed time.
- 9. Risk, Should-fix: every keystroke and every streamed chunk re-renders every finished turn's activity rows and
  card table.
  Decision: fixed by item 9.
  - `ui/assistant-chat.tsx:74` subscribes to the prompt input, and `AIChatMessages` (:219-226) is not memoized.
    `libs/ai-react/src/lib/ai-chat-messages.tsx:51-63` calls `renderMessage` for every message on each render.
  - `renderMessage` changes identity whenever any run changes (`ui/use-assistant-message-renderer.tsx:28-31`, :61).
    `renderChatMessage` builds fresh `AIToolActivity` and `AssistantCardsMessage` elements, the latter with a new
    `onRetry` closure (:94-127, :232-248); neither is memoized.
  - Only `AIChatMessage` is memoized (`libs/ai-react/src/lib/ai-chat-message.tsx:20-22`), and that covers only the
    text.
    Its comment ("streamed chunks re-render only the tail message") claims more than it does.
    `libs/ai-react/src/lib/ai-chat-message.test.tsx:6-11` checks only `$$typeof`.
  - The report's probe: one finished card turn mounted with the real renderer.
    Its table and activity rendered 1 time on mount, 6 times after five keystrokes, and 12 times after five more
    streamed chunks.
    The cost grows with the number of card turns, at chunk rate.
- 10. Risk, Should-fix: the `assistant-react` suite failed in some file orders.
  Decision: fixed by `8400cfe9` before this task; no plan item.
  - The report saw `conversation-list-timestamp.test.ts` import the real `@lingui/react` while the list test
    module-mocked it, under `isolate: false`.
    Seeds 2, 3, and 5 of `--maxWorkers=1 --sequence.shuffle.files` failed.
  - `8400cfe9` moved the `@lingui/react` stub to `src/test-setup.ts` and deleted the file-level copies.
  - Re-checked at triage: `ui/use-assistant-message-renderer.test.tsx:14` and `ui/assistant-cards-message.test.tsx:13`
    still replace all of `@koloda/ai-react`.
    No other test imports the renderer or the cards message, so no sibling binds the real module first.
    The `vitest.config.mjs` WHY holds today.
    Item 7 drops the cards test's mock.
- 11. Risk, Later: a success run without a saved duration loses its activity rows and its copy action.
  Decision: fixed by item 6.
  - `renderRunStatus` returns no status for a success run with `elapsedSeconds === null`
    (`ui/use-assistant-message-renderer.tsx:154-163`).
    The plain path then falls through to `return content` (:282-293), which drops the tool and thinking rows and the
    copy action.
    The mixed path drops the copy action.
  - The report's probe: the same run renders its Thought row and copy button with `elapsedSeconds: 2`, and neither
    with `null`.
  - Live completion always stamps a duration, but restore accepts `null` for any status
    (`persistence/conversation-persistence-schema.ts:177`), so only rows from older builds reach this.
  - §Message Display says activity rows appear "even when there are no cards".
    §Message States includes elapsed time only "when a duration was saved".
- 12. Improvement, Later: `AssistantCardsMessage` keeps a status ladder that production never renders.
  Decision: fixed by item 7.
  - Its only caller passes `showStatus: false` (`ui/use-assistant-message-renderer.tsx:246`).
    Search: `grep -rn 'AssistantCardsMessage\b' libs apps` over TS and TSX, ignoring `dist/` and tests.
  - Dead in production: the ladder in `ui/assistant-cards-message.tsx` (:74, :88-102); the props `showStatus`,
    `isCanceled`, `isInterrupted`, `isFailed`, `canRetry`, `onRetry`, `elapsedSeconds`, `startedAt`, and `modelName`
    (:19-28, :40-48); and `isTerminal` and `isSuccess` (:66-67).
  - `ui/assistant-cards-message.test.tsx:97-137` exercises only that path.
    The renderer test's stub of the component re-implements it (`ui/use-assistant-message-renderer.test.tsx:49-67`).
- 13. Improvement, Later: other dead surface in the message shell.
  Decision: fixed by items 7 and 8; the trailing `continue` went in `ee682737`.
  - `modelName` is threaded `ui/assistant-chat.tsx:223` → `libs/ai-react/src/lib/ai-chat-messages.tsx:21,28,55` →
    `libs/ai-react/src/lib/ai-chat-message.tsx:15`, but never read (:22).
    It also re-renders every memoized message when the model changes.
  - The `interrupted` part type and branch (`libs/ai-react/src/lib/ai-chat-message.tsx:6-11`, :71-72) have no
    producer.
    `grep -rn 'type: "interrupted"' libs apps` finds only the type; the producer was removed in `f681ab1a`.
  - `canRetry={isTail && !!run}` (`ui/use-assistant-message-renderer.tsx:120`): `run` is required, so `!!run` is always
    true.
    The prop goes with entry 12.
- 14. Improvement, Later: test residue around messages and revert.
  Decision: fixed by item 13.
  - `runs/use-run-orchestration.test.ts:368` and :554 assert `not.toHaveProperty("mode")` for a field that no longer
    exists.
    They can only fail if someone re-adds it, which fails TESTING.md's survival question.
  - `state/assistant-messages.test.ts:15` is titled `aiChatUtility`, a module that does not exist
    (TESTING.md (§Repetition and tables)).
  - `state/assistant-conversation-revert-atoms.test.ts:103` and :158 re-check `getVisibleMessages` through the atom.
    Its home is `state/conversation-reducer-messages.test.ts:436` (TESTING.md (§One home per behavior)).
- 15. Product decision, Later: reloading during a revert keeps the pre-fill in the composer and loses the draft.
  Decision: fixed by item 2; reload acts like Restore (question 2).
  - Revert writes the pre-fill through `setInputValue` (`ui/assistant-chat.tsx:158`) into the saved prompt input
    and marks the conversation dirty (`state/conversation-actions.ts:91-98`).
  - The revert state and its held draft are not saved (`persistence/conversation-persistence.ts:40-41`).
  - After a reload all turns are visible again, the composer holds the reverted message's text, and the draft typed
    before the revert is gone.
  - ASSISTANT-CONVERSATIONS.md (§Revert State) says only "Reloading the app clears the revert state."

Out:

- Findings the conversations and conversation list audits carried; they landed in
  `tasks/archive/assistant-conversations-audit.md` and `tasks/archive/assistant-conversation-list-audit.md`.
  That includes the report's "seen in passing": Enter while reverted with no model resolved (conversations
  finding 2, fixed there).
- The other assistant slices (data access, card generation, settings, AI providers).
- Tool rows (ASSISTANT-DATA-ACCESS.md) and card selection and add (ASSISTANT-CARD-GENERATION.md).

## Open questions

- [x] 1. Task shape: this report alone, or paired? — this report alone (human, 2026-10-22).
- [x] 2. Entry 15: on reload during a revert, give back the draft (like Restore), or keep the pre-fill? — give back
  the draft (human, 2026-10-22).
- [x] 3. Entry 5: Russian wording? — Thinking "Размышляет", Thought stays "Размышление" (human, 2026-10-22).
- [x] 4. Flow? — `local`, the default.

## Plan

Paths without a package prefix are under `libs/assistant-react/src/lib/`.
Line numbers are at `5801f741`; when an earlier item moved them, find the code by its text.
`AR` below stands for `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner`.
`AIR` stands for the same command with `libs/ai-react/vitest.config.mjs`.

- [x] 1. Keep the first draft when reverting again
  Goal (entry 1):
  - In `handleRevert` (`runs/use-run-orchestration.ts:184-207`), store
    `state.revertState?.preRevertInputText ?? currentInputText` as `preRevertInputText`.
    Only the first revert takes the live composer text; a later revert keeps what the first one held.
    Add a WHY: the composer holds the earlier pre-fill at that point, not the user's draft.
  - Add an orchestration case in `runs/use-run-orchestration.test.ts`, next to the revert cases (:526 onward).
    Composer "my draft", revert to turn 2, revert to turn 1, restore: `restore` returns "my draft".
  - Narrow `state/conversation-reducer-revert.test.ts:119` ("updates the revert point without deleting anything").
    It should assert the new point and that nothing is deleted, not that the held draft is replaced (:191-197).
  - ASSISTANT-MESSAGES.md (§Reverting Again): add that the text held from before the first revert is kept.
  Constraints: `handleRevert`, the two tests, and that spec section.
  Leave the chat shell's revert wiring (`ui/assistant-chat.tsx:155-166`) as it is.
  Done when:
  - `AR use-run-orchestration conversation-reducer-revert` passes;
  - the new case fails against the old `handleRevert`.
  Manual verify (web):
  - AI route → a conversation with at least two finished turns → type "my draft" → revert at turn 2 → revert at
    turn 1 → Restore → every turn is visible and the composer shows "my draft".
  Commit: Keep the first draft when reverting again
  Depends on: none

- [ ] 2. Give back the pre-revert draft after a reload
  Goal (entry 15; question 2):
  - In `toPersistedState` (`persistence/conversation-persistence.ts:40-48`), when `state.revertState` is set, write
    `promptInput: state.revertState.preRevertInputText`.
    A reload then clears the revert state and shows the draft, as Restore does.
  - Update the doc comment on `PersistedConversation` (:28-35): `promptInput` is the composer text, or the held draft
    while a revert is active.
  - ASSISTANT-CONVERSATIONS.md (§Revert State, :284-287): reloading also returns the prompt input to its pre-revert
    state, as Restore does (ASSISTANT-MESSAGES.md (§Restore)).
    In §What Doesn't Get Saved, the line "The current composer text is stored with the conversation" gets a pointer to
    §Revert State for the exception.
  - Add cases to `persistence/conversation-restore.test.ts` (`toPersistedState / fromPersistedState`, :45).
    A reverted state with composer "First" and held draft "my draft" persists "my draft".
    A state with no revert persists its composer text.
  Constraints: the persistence boundary only.
  Do not save the revert state, and do not change the reducer or the save scheduler.
  The title is computed from the first user message (`libs/ai/src/lib/conversations.ts:29-33`); hidden turns are still
  in state until the next submit, so it is not affected.
  Done when:
  - `AR conversation-restore conversation-write-adapter` passes.
  Manual verify (web):
  - AI route → a conversation with two finished turns → type "my draft" → revert at turn 1 → wait two seconds →
    reload → every turn is visible and the composer shows "my draft".
  - Same, but Restore before the reload → the composer still shows "my draft".
  Commit: Give back the pre-revert draft after a reload
  Depends on: 1

- [ ] 3. Separate text segments of a response with a paragraph break
  Goal (entry 2):
  - In `libs/ai/src/lib/chat-stream.ts` (the part loop at :57-71), handle the SDK's `text-start` part.
    When a new text block starts after text was already emitted in this stream, prefix the next non-empty
    `text-delta` with `"\n\n"`.
    Prefix lazily, so an empty block adds nothing.
  - The runtime accumulator (`libs/assistant/src/lib/conversation-runtime.ts:257`) then stores
    "Let me check your decks.\n\nYou have 2 decks.".
    Markdown renders two paragraphs, and `getTextMessageContent` sends the break in history.
  - Before the change, confirm with the SDK mock model that a tool step boundary arrives as a new `text-start`.
    If it does not, key the break on `start-step` instead, and say so in the commit body.
  - Add `libs/ai/src/lib/chat-stream.test.ts` cases with the AI SDK mock model:
    text, a tool call, then text gives one break between them;
    a single text block gives no break;
    an empty text block between two segments gives exactly one break.
  Constraints: `chat-stream.ts` and its test.
  Leave the runtime accumulator and the reducer's single text part as they are.
  Done when:
  - `bunx vitest run --config libs/ai/vitest.config.mjs --configLoader runner chat-stream conversations` passes;
  - `bunx vitest run --config libs/assistant/vitest.config.mjs --configLoader runner` passes.
  Manual verify (web):
  - AI route → a model with tools → ask "How many decks do I have?" with a prompt that makes the model write a line
    before the tool call → the answer shows the line and the result as two paragraphs.
  - Copy that answer → the pasted text has a blank line between them.
  - Skip if: the model never writes text before calling a tool.
  Commit: Separate text segments of a response with a paragraph break
  Depends on: none

- [ ] 4. Show no Thought row for whitespace-only reasoning
  Goal (entry 4):
  - In `appendAssistantReasoning` (`state/conversation-run-stream.ts:62-85`), ignore a whitespace-only delta unless
    the trailing activity is a reasoning row with status `running`.
    Then append it as today, so spacing inside a running thought survives.
    This also keeps a whitespace delta from reopening a row that answer text already closed.
  - Turn "ignores an empty reasoning delta" (`state/conversation-reducer-messages.test.ts:215-219`) into an
    `it.each` over `""`, `"\n\n"`, and `"  "`.
  - Add a case: "a\n" then "\nb" on a running row gives one row with text "a\n\nb".
  Constraints: the reducer function and its test.
  Done when:
  - `AR conversation-reducer-messages` passes;
  - the `"\n\n"` row fails against the old code.
  Manual verify (web):
  - AI route → a local Qwen-style model with thinking off → send a prompt → no Thought row appears above the answer.
  - Skip if: no such model is set up.
  Commit: Show no Thought row for whitespace-only reasoning
  Depends on: none

- [ ] 5. Tell Thinking from Thought in Russian
  Goal (entry 5; question 3):
  - In `libs/ai-react/locales/ru/messages.po:194-195`, set `ai.chat.tool-activity.thinking` to "Размышляет".
    `ai.chat.tool-activity.thought` stays "Размышление".
  - Compile both apps' catalogs per `agents/I18N.md`: `nx run @koloda/web:lingui-compile` and
    `nx run @koloda/electron-react:lingui-compile`.
    Commit the updated `apps/web/src/app/locales/ru.ts` and `apps/electron-react/src/app/locales/ru.ts`.
  Constraints: the catalog and the two compiled files.
  Done when:
  - both compiled `ru.ts` files contain "Размышляет";
  - `bun run check:push` still passes its i18n checks.
  Manual verify (web):
  - Settings → language Russian → AI route → a reasoning model → send a prompt → the row reads "Размышляет" while
    thinking and "Размышление" after.
  Commit: Tell Thinking from Thought in Russian
  Depends on: none

- [ ] 6. Keep activity rows and copy on a success run without a duration
  Goal (entry 11):
  - In `renderRunStatus` (`ui/use-assistant-message-renderer.tsx:152-176`), always return the success status.
    Pass `elapsedSeconds={run.elapsedSeconds ?? undefined}`.
  - In `AIChatMessageStatus` (`libs/ai-react/src/lib/ai-chat-message-status.tsx:84-98`), the success state shows
    the model name and the time only when each is present.
    Today it renders `elapsedSeconds ?? 0`, which would read "0s".
    Show the dot separator only when both are present, and no empty `<p>` when neither is.
  - `renderRunStatus` then returns a node for every non-streaming run.
    Drop the `if (terminalStatus)` check and the `return content` fallthrough in `renderChatMessage` (:282-293).
  - Tests:
    `ui/use-assistant-message-renderer.test.tsx`: a success run with `elapsedSeconds: null` and a reasoning row shows
    the activity and the copy action;
    `libs/ai-react/src/lib/ai-chat-message-status.test.tsx`: success without `elapsedSeconds` shows no time, and with
    a model name shows the name without a separator.
  Constraints: the success branch, the renderer's status helper, and their tests.
  Done when:
  - `AR use-assistant-message-renderer` and `AIR ai-chat-message-status` pass.
  Manual verify: none — only rows saved by older builds lack a duration; the renderer test covers it.
  Commit: Keep activity rows and copy on a success run without a duration
  Depends on: none

- [ ] 7. Delete the cards message status ladder
  Goal (entries 12 and 13, `!!run`):
  - In `ui/assistant-cards-message.tsx`, delete the status ladder (:74, :88-102), `isTerminal` and `isSuccess`
    (:66-67), and the props `showStatus`, `isCanceled`, `isInterrupted`, `isFailed`, `canRetry`, `onRetry`,
    `elapsedSeconds`, `startedAt`, and `modelName` (:19-28, :40-48).
    Drop the `AIChatMessageStatus` import.
  - In `renderCardsMessage` (`ui/use-assistant-message-renderer.tsx:85-127`), stop passing them.
    That removes `canRetry={isTail && !!run}`.
    Drop the options that become unused, and the `showStatus: false` argument with its WHY (:244-246).
  - In `ui/assistant-cards-message.test.tsx`, delete the ladder cases (:97-137).
    Keep the unavailable-template cases (:138 onward).
    The component's only `@koloda/ai-react` import left is `AIChatMessageLayout`, a plain wrapper.
    Delete the file's `vi.mock("@koloda/ai-react")` (:13-29) and render the real one.
  - In `ui/use-assistant-message-renderer.test.tsx`, drop `showStatus` from the `AssistantCardsMessage` stub (:49-67)
    and any assertion on `data-show-status`.
    Pending-status assertions on mixed turns stay; they test the renderer's own pending row.
  - Check that the WHY on `renderRunStatus` (:140-143), "one terminal-status ladder for every run rendering path", is
    now true.
  Constraints: the component, its one caller, and their tests.
  Done when:
  - `AR assistant-cards-message use-assistant-message-renderer` passes;
  - `grep -n "showStatus\|isFailed\|onRetry" libs/assistant-react/src/lib/ui/assistant-cards-message.tsx` finds
    nothing.
  Manual verify: none — the deleted branch was never rendered in production.
  Commit: Delete the cards message status ladder
  Depends on: 6

- [ ] 8. Delete unused chat message props and part types
  Goal (entry 13):
  - Delete `modelName` from `AIChatMessageProps` (`libs/ai-react/src/lib/ai-chat-message.tsx:15`), from
    `AIChatMessagesProps` and its pass-through (`libs/ai-react/src/lib/ai-chat-messages.tsx:21`, :28, :55), and from
    the `AIChatMessages` call in `ui/assistant-chat.tsx:223`.
    Keep `modelName` in `assistant-chat.tsx` where other code reads it (:99, :124).
  - Delete `InterruptedPart`, the `ChatMessagePart` union, and the `interrupted` case
    (`libs/ai-react/src/lib/ai-chat-message.tsx:6-11`, :71-72).
    Use `UIMessagePart<any, any>` where `ChatMessagePart` was (:16, :58, :88).
  - Update any `ai-react` test that passes `modelName` to `AIChatMessage` or `AIChatMessages`, or renders an
    `interrupted` part.
  Constraints: `@koloda/ai-react` message components and the one call site; `agents/BACKWARDS-COMPATIBILITY.md`.
  Done when:
  - `AIR` and `AR` pass;
  - `grep -rn 'interrupted"' libs/ai-react/src/lib/ai-chat-message.tsx` finds nothing.
  Manual verify: none — the props and the part type had no reader or producer.
  Commit: Delete unused chat message props and part types
  Depends on: none

- [ ] 9. Re-render only the assistant turns that changed
  Goal (entry 9):
  - Add a memoized assistant turn component in `ui/`.
    Its props are the message, its run, `runId`, `isTail`, `isCurrentRun`, and `handleRetry`.
    It renders what `renderChatMessage` builds today (`ui/use-assistant-message-renderer.tsx:218-294`).
  - The turn renders its own text through `AIChatMessage` with `renderAssistantMarkdown`, instead of taking the
    `content` element.
    `AIChatMessages` rebuilds `content` on every render (`libs/ai-react/src/lib/ai-chat-messages.tsx:51-63`), so a
    `content` prop would defeat the memo.
    Put that in a WHY.
  - `renderMessage` returns the turn for assistant messages and keeps `content` for user messages.
  - Immer keeps untouched messages and runs stable, so finished turns skip re-render while the tail streams.
    Confirm `handleRetry` (`runs/use-run-orchestration.ts:57`) keeps its identity across chunks and keystrokes.
    If it does not, make it stable in the same item.
  - Correct the WHY on `AIChatMessage`'s memo (`libs/ai-react/src/lib/ai-chat-message.tsx:20-21`) to say it covers the
    message text only.
  - Replace the `$$typeof` test (`libs/ai-react/src/lib/ai-chat-message.test.tsx:6-11`) with a render-count test in
    `ui/use-assistant-message-renderer.test.tsx`.
    Count renders through the existing `AIToolActivity` and `AssistantCardsMessage` stubs.
    Mount a finished card turn and a streaming tail, re-render the list five times as a keystroke does, and stream
    five chunks into the tail.
    The finished turn's activity and table render once.
  Constraints: the renderer, the new turn component, the `AIChatMessage` WHY, and the tests.
  Leave `AIChatMessages`' `renderMessage(message, content)` signature as it is.
  Done when:
  - `AR` and `AIR` pass;
  - the render-count test fails against the old renderer.
  Manual verify (web):
  - AI route → a conversation with a finished card turn → select two cards → send a new prompt → while it streams,
    the card table keeps its selection, and Add still adds the selected cards after the run ends.
  - Copy and Retry on the tail turn still work after a failed or canceled run.
  Commit: Re-render only the assistant turns that changed
  Depends on: 6, 7, 8

- [ ] 10. Drop the error marker from the messages spec
  Goal (entries 3 and 6):
  - In `docs/specs/ASSISTANT-MESSAGES.md`:
    - Core model: drop "Metadata kind" (:23).
    - Relationships: drop the error-marker bullet (:31).
    - Drop §Message Metadata (:47-59); only one kind is left, and it does not change what the user sees.
    - §Message Display: the chat-text bullet becomes the description of assistant messages; drop the error bullet
      (:80).
    - §Message States: a failed run keeps its partial content and shows a failed status.
      Drop the per-state retry mentions (:105-110) and point at ASSISTANT-CONVERSATIONS.md (§Retry) once.
    - §Sending a Message (:123): if the run fails, the user message and the assistant message with any partial text
      remain.
    - §Retrying a Run: drop :136; ASSISTANT-CONVERSATIONS.md (§Retry) covers the overwrite.
    - §Reverting the Conversation: :146 lists success, failed, canceled, and interrupted; :153 drops "including any
      error marker".
  - Check ASSISTANT-CONVERSATIONS.md and ASSISTANT-CARD-GENERATION.md for any pointer at the removed sections.
  Constraints: docs only; FUNCTIONAL-SPECIFICATIONS.md and MARKDOWN.md apply.
  Done when:
  - `grep -n -i "error marker\|metadata kind\|chat-text" docs/specs/ASSISTANT-MESSAGES.md` finds nothing;
  - `bun run check:markdown` prints no warning for the spec.
  Manual verify: none — docs only.
  Commit: Drop the error marker from the messages spec
  Depends on: none

- [ ] 11. State the mixed-turn order and pending rule once in the messages spec
  Goal (entry 8):
  - The mixed-turn order lives in §Message Display (:73-75).
    The Relationships bullet (:32-33) points at §Message Display instead of ASSISTANT-CARD-GENERATION.md
    (§Card Display); that ends the circular pointer.
    :79 and :114 stop restating the order; :114 may keep saying what a mixed turn's content includes.
  - The pending rule lives in §Message States (:98-102); §Message Display (:76-78) points there.
  - Replace the stray line :111 with a pointer to ASSISTANT-CONVERSATIONS.md (§Restore) for elapsed time, after a
    blank line so it is not folded into the list.
  Constraints: docs only; FUNCTIONAL-SPECIFICATIONS.md (§Core model, §Principles) and MARKDOWN.md apply.
  Line numbers move after item 10.
  Done when:
  - each of the two rules appears once;
  - ASSISTANT-CARD-GENERATION.md:88 and ASSISTANT-MESSAGES.md no longer point at each other for the order.
  Manual verify: none — docs only.
  Commit: State the mixed-turn order and pending rule once in the messages spec
  Depends on: 10

- [ ] 12. Describe message copy and send time in the messages spec
  Goal (entry 7):
  - Add §Copying a Message under §Interactions:
    - a user message's copy action copies its text;
    - an assistant turn's copy action copies its cards as serialized for history, then its leftover text, separated
      by a blank line;
    - it shows in the turn's status row once the run has finished, and only when there is something to copy.
    Source: `ui/use-assistant-message-renderer.tsx:65-83`, :221-228, and `renderRunStatus`.
  - In §Message Display, add that each user message shows its send time.
    It reads "Today, <time>" for today and the full date and time otherwise (`ui/message-timestamp.tsx`).
    The formats follow INTERFACE-SETTINGS.md; point there.
  - ASSISTANT-CARD-GENERATION.md:100 ("The message copy action includes the cards") points at the new section.
  Constraints: docs only.
  Done when:
  - the spec names both copy actions and the user message time.
  Manual verify: none — docs only.
  Commit: Describe message copy and send time in the messages spec
  Depends on: 11

- [ ] 13. Drop dead assertions and duplicate cases from message tests
  Goal (entry 14):
  - Drop the `not.toHaveProperty("mode")` assertions (`runs/use-run-orchestration.test.ts:368`, :554).
    Delete a case if that assertion was all it checked.
  - Rename the `aiChatUtility` describe (`state/assistant-messages.test.ts:15`) after what its cases test.
  - In `state/assistant-conversation-revert-atoms.test.ts`, keep the hide case (:103) with a one-line WHY: it pins
    that `assistantMessagesAtom` applies the revert filter.
    Delete the restore case (:158); `state/conversation-reducer-messages.test.ts:436` owns `getVisibleMessages`.
  Constraints: tests only.
  Done when:
  - `AR use-run-orchestration assistant-messages assistant-conversation-revert-atoms` passes.
  Manual verify: none — tests only.
  Commit: Drop dead assertions and duplicate cases from message tests
  Depends on: 1

## Outcome

<what shipped>
