# Conversation reducer split

Status: done

## Intent

Shrink `libs/assistant-react/src/lib/assistant/state/conversation-reducer.ts` (~846 lines) into domain modules with zero behavior change. One `ConversationReducerState`, one `actions` map, one `conversationReducer` entry; all existing `from "./conversation-reducer"` imports keep working via re-exports. Done when the reducer file is only the actions map + produce wrapper + re-exports and the full assistant-react suite is green with no test changes.

## Scope

In: pure code motion inside `libs/assistant-react/src/lib/assistant/state/` — extract types, helpers, and four handler domains out of `conversation-reducer.ts`, keeping the `actions` map shape (`:141`) and `dispatchReducerAction` wiring intact.
Out: state slicing, a second reducer, new behavior, test edits, import churn outside `state/`, the `conversation-actions.ts` atoms.

## Open questions

- [x] Session module naming — `conversation-session.ts`: the five handlers share conversation-scoped (non-run) state, mirroring the state shape; consistent with the `conversation-run-*` siblings. `meta` rejected as vague; splitting profile now rejected (only piece with mass, split later if it grows).
- [x] `assistant-messages.ts` import edge — no cycle: it imports only from `@koloda/ai` / `@koloda/srs` / `ai`, never from the reducer. `dropRuns` and `commitRevert` keep their identical `from "./assistant-messages"` import in the new modules; nothing to watch.

## Plan

- [x] 1. Extract types to `conversation-types.ts`
  Goal: Move `CardStatus`, `RunStatus`, `RunTerminationReason`, `InterruptedReason`, `ToolCallStatus`, `RunToolCall`, `RunReasoningActivity`, `RunActivity`, `isReasoningActivity`, `AssistantRun`, `RevertState`, `ConversationReducerState`, `initialConversationState`, `RunLifecycleEvent` into `conversation-types.ts` with zero logic change; re-export everything from `conversation-reducer.ts`.
  Constraints: `conversation-types.ts` imports from no sibling; touch only the two files.
  Done when: `bunx tsc --noEmit -p libs/assistant-react/tsconfig.lib.json` clean and `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner` green.
  Commit: Extract conversation reducer types

- [x] 2. Extract helpers to `conversation-run-helpers.ts`
  Goal: Move `makeRun`, `elapsedSecondsSince`, `activityTiming`, `stampActivityElapsed`, `finishRunningReasoning`, `stampRunningToolElapsed`, `ensureActivity`, `stampElapsed`, `clearActiveIfRun`, `dropRuns`, `hasRetryableTurn`, `findLatestErroredRun`, `getVisibleMessages` into `conversation-run-helpers.ts`; promote the six currently-private helpers (`makeRun`, `clearActiveIfRun`, `ensureActivity`, `stampElapsed`, `finishRunningReasoning`, `stampRunningToolElapsed`) to module exports since three handler modules need them; re-export the public ones from the seam.
  Constraints: helpers import only from `conversation-types.ts`; touch only the two files.
  Done when: same tsc + vitest commands green.
  Commit: Extract conversation run helpers

- [x] 3. Move lifecycle handlers to `conversation-run-lifecycle.ts`
  Goal: Move `transitionRun`, the `completeRun` / `runFailed` / `cancelRun` / `interruptRun` / `restartRun` action handlers, `applyRetryAssistantKind`, and `setUsage` into `conversation-run-lifecycle.ts`; wire them into the unchanged `actions` map.
  Constraints: lifecycle imports only from types + helpers (+ existing cross-module imports like `logAssistantStructured` stay as-is); no logic change.
  Done when: same tsc + vitest commands green.
  Commit: Extract run lifecycle from conversation reducer

- [x] 4. Move stream handlers to `conversation-run-stream.ts`
  Goal: Move `submitTurn`, `rollbackSubmitTurn`, `addUserMessage`, `addAssistantMessage`, `startRun`, `updateAssistantText`, `appendAssistantReasoning` into `conversation-run-stream.ts`; wire into the unchanged `actions` map. `submitTurn`'s atomic trio (user message + run + assistant placeholder) stays one draft pass by construction.
  Constraints: stream imports only from types + helpers; no logic change.
  Done when: same tsc + vitest commands green.
  Commit: Extract submit/stream handlers from conversation reducer

- [x] 5. Move tool/card handlers to `conversation-run-tools.ts`
  Goal: Move `addCard`, `setCardStatus`, `addToolCall`, `setToolCallResult`, `boundToolOutput`, `boundToolError`, the `MAX_TOOL_*` constants, and private `applyProposeCardsToRun` into `conversation-run-tools.ts`; wire into the unchanged `actions` map.
  Constraints: tools import only from types + helpers; no logic change.
  Done when: same tsc + vitest commands green.
  Commit: Extract tool/card handlers from conversation reducer

- [x] 6. Move session handlers and thin the reducer
  Goal: Move `setAIProfile`, `setAIModel`, `setAIModelParameter`, `applyAIConfig`, `dismissRunError`, `markRead`, `newConversation`, `setPromptInput`, `setRevertState`, `commitRevert` into `conversation-session.ts`; leave `conversation-reducer.ts` as the `actions` map + `produce` wrapper + `conversationReducer` + re-exports only (~60 lines); verify no importer outside `state/` changed.
  Constraints: session imports only from types + helpers (+ `getMessageRunId` import moves with `commitRevert`); no logic change; no test edits.
  Done when: same tsc + vitest commands green; `rg "from.*conversation-reducer" libs apps --include='*.ts*'` shows no new importing files vs before.
  Commit: Finish reducer split with session handlers extract

## Outcome

Shipped in `2520dae`, `c222d56`, `e009f99`, `cb72394`, `2ebd296`, `2b4a3e3` (2026-09-11). `conversation-reducer.ts` is 58 lines: `actions` map + `produce` wrapper + `conversationReducer` + re-exports. Domain modules: `conversation-types.ts` (140), `conversation-run-helpers.ts` (124), `conversation-run-lifecycle.ts` (169), `conversation-run-stream.ts` (143), `conversation-run-tools.ts` (158), `conversation-session.ts` (129). Two deviations from the letter of the plan, both within its constraints: `RunIdPayload` (shared by lifecycle + session handlers) lives in `conversation-types.ts` instead of being duplicated, and the promoted private helpers are eight, not six — `activityTiming` and `stampActivityElapsed` are also needed by the stream/tools modules. The seam re-exports the four public helpers plus `boundToolError`/`boundToolOutput`; `export *` covers the types. `bunx tsc --noEmit -p libs/assistant-react/tsconfig.lib.json` clean per step; `bunx vitest run --config libs/assistant-react/vitest.config.mjs --configLoader runner` 505/505 (32 files) per step with no test edits; importer set of `conversation-reducer` identical before/after (32 files). No test changes, no import churn outside `state/`.
