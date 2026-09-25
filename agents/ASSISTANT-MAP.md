# Assistant map

Task routing for assistant chat.
Behavioral rules live in the specs.
Package boundaries and implementation seams live in the package READMEs.
Read one spec first.
Add a sibling only when the task crosses that spec.

## Folder layout (`libs/assistant-react/src/lib/`)

| Folder | Owns |
|--------|------|
| `state/` | Reducer, store, selectors, actions, messages, profile/config types, AI profile dual-write payloads (`ai-profile-sync`) |
| `runs/` | Session (`RunController`), orchestration, engine host, command prep (`prepare-run-request` / `build-stream-request`), restore-only `dataAccess` snapshot types (`data-access`), thin `engine.dispatch` adapter |
| `persistence/` | Restore/saver hooks, coerce/normalize, `schemaVersion` migrations, save host adapter |
| `ui/` | Chat shell, lists, settings, message/card renderers (incl. tool-activity wiring), chrome |
| *(root)* | Profile cascade hooks (`use-assistant-profile-selection`, `use-global-ai-profile-state`), runtime config, client, prompt templates |

Stream execution, AbortControllers, serial queues, and save scheduling live in `@koloda/assistant`, not in `runs/`.
`use-conversation-runs.ts` only returns `engine.dispatch`.
Do not put chunk dispatch or run lifecycle there.
See `libs/assistant-react/README.md` (§Dispatch).

## Task routing

| Task | Read first | Primary files |
|------|------------|---------------|
| Add a new AI provider | `agents/ADD-AI-PROVIDER.md` | `libs/ai/src/lib/provider-catalog.ts`, `provider-secrets.ts`, `libs/ai/src/lib/providers/<provider>.ts`, `provider-registry.ts`, `crates/koloda/src/domain/ai.rs` |
| Add a new assistant tool | `agents/ADD-ASSISTANT-TOOL.md` | `libs/ai` `assistant-tools.ts`, `assistant-tool-executor.ts`; host binders `apps/web/src/app/ai-runtime.ts`, `apps/electron/src/ai-ipc.ts`; activity `libs/ai-react/src/lib/ai-tool-activity.tsx` |
| Change the conversation list, create, name, or unread | `docs/specs/ASSISTANT-CONVERSATION-LIST.md` | `ui/assistant-conversations-list.tsx`, `ui/assistant-new-conversation-button.tsx`, `ui/conversation-list-timestamp.tsx`; `state/conversation-actions.ts` (`newConversationAtom`, `startParamlessConversationAtom`); `state/conversation-selectors.ts` (`unreadConversationIdsAtom`); `state/conversation-session.ts`; `libs/ai` `conversations.ts` (`computeConversationTitle`) |
| Change clone or delete | `docs/specs/ASSISTANT-CONVERSATION-LIST.md` (§Clone, §Delete) | `ui/clone-conversation-button.tsx`, `ui/conversation-header-menu.tsx`, `state/conversation-actions.ts` (`cloneConversationAtom`); `ui/use-delete-conversation.ts`, `ui/delete-conversation-button.tsx`, `ui/delete-conversation-confirm-dialog.tsx`, `ui/delete-conversation-menu-action.tsx`; `@koloda/assistant` delete transaction |
| Fix streaming / chunk handling | `docs/specs/ASSISTANT-CONVERSATIONS.md` (§Runs, §During Streaming) | `@koloda/assistant` (`run-stream.ts`, `conversation-runtime.ts`, `assistant-execution-port.ts`); host execution port in `runs/assistant-execution-port.ts`; request prep in `runs/prepare-run-request.ts` |
| Change AIRuntime / key proxy | `libs/ai/README.md` (§AIRuntime) | `libs/ai` `runtime.ts`; core-react `aiRuntimeAtom`; Electron `ai-ipc` + renderer `ai-runtime`; web `ai-runtime` |
| Change run lifecycle (start/cancel/fail) | `docs/specs/ASSISTANT-CONVERSATIONS.md` (§Runs) | `state/conversation-reducer.ts` (`transitionRun`, `submitTurn`, `rollbackSubmitTurn`); `runs/use-run-orchestration.ts`; `runs/prepare-run-request.ts`; `@koloda/assistant` (`assistant-engine.ts` `dispatch`, `conversation-runtime.ts`, `run-controller-registry.ts`) |
| Change conversation history rules | `docs/specs/ASSISTANT-CONVERSATIONS.md` (§Conversation History) | `state/conversation-reducer.ts` (`getVisibleMessages`), `state/assistant-messages.ts`, `runs/use-run-orchestration.ts`, `runs/prepare-run-request.ts`, `runs/build-stream-request.ts` |
| Change assistant data access (chat tools, historical snapshots) | `docs/specs/ASSISTANT-DATA-ACCESS.md` | `libs/ai` `assistant-tools.ts`, `assistant-tool-executor.ts`, `chat-stream.ts`; host binders `apps/web/src/app/ai-runtime.ts`, `apps/electron/src/ai-ipc.ts`; `@koloda/assistant` execution port; `runs/build-stream-request.ts`, `runs/assistant-event-to-action.ts`, `runs/data-access.ts`; `state/conversation-reducer.ts` tool actions; `libs/ai-react` `ai-tool-activity.tsx` |
| Change mixed chat / card-proposal rendering | `docs/specs/ASSISTANT-MESSAGES.md` (§Message Display, §Message Content) | `ui/use-assistant-message-renderer.tsx`, `ui/assistant-markdown.tsx`, `ui/assistant-cards-message.tsx`, `state/assistant-messages.ts`; `libs/ai-react` `ai-chat-message.tsx` (`renderText`), `ai-tool-activity.tsx` (`renderText`) |
| Fix AI profile state (profile/model/params) | `docs/specs/ASSISTANT-CONVERSATIONS.md` (§AI Profile State) | `libs/ai-react/src/lib/ai-model-profile-picker.tsx`, `ai-model-parameters.tsx`; `use-assistant-profile-selection.ts`, `use-global-ai-profile-state.ts`, `state/ai-profile-sync.ts`, `use-assistant-runtime-config.ts`, `state/assistant-conversation-config.ts` |
| Empty chat / model picker when user has no AI profiles | `docs/specs/ASSISTANT-CONVERSATIONS.md` (§AI Profile State) | `ui/assistant-no-profiles.tsx`, `ui/assistant-chat.tsx`; `libs/ai-react/src/lib/ai-model-profile-picker.tsx`; `libs/app-react/src/lib/routes/_.ai.tsx`; `libs/settings-react/src/lib/settings-ai-add-profile.tsx` |
| Change assistant settings (prompt template / temperature) | `docs/specs/ASSISTANT-SETTINGS.md` | `ui/assistant-settings.tsx`, `ui/assistant-settings-prompt-editor.tsx`, `use-assistant-runtime-config.ts` |
| Modify card proposal parsing | `docs/specs/ASSISTANT-CARD-GENERATION.md` | `libs/ai` `assistant-tools.ts` (`propose_cards` coerce/shape) + `assistant-tool-executor.ts`; host data sources; reducer `applyProposeCardsToRun` |
| Change persistence / restore | `docs/specs/ASSISTANT-CONVERSATIONS.md` (§Persistence, §Restore) | `@koloda/assistant` save queue, scheduler, persistence host; `persistence/` restore, schema, `conversation-write-adapter.ts`; `runs/assistant-engine-instance.ts`, `runs/assistant-persistence-host.ts`, `runs/use-assistant-engine-host.ts`; shell mount `@koloda/app-react` `components/app.tsx`; Electron close `apps/electron/src/window-close-coordinator.ts` + `electron-close-coordination.ts`; `@koloda/db-sqlite`, `crates/koloda/src/repo` |
| Choose conversation dispatch flavor | `libs/assistant-react/README.md` (§Dispatch) | `runs/use-assistant-session.ts`, `state/conversation-store.ts` (`dispatchToConversation` / `dispatchToConversationOnStore`), `runs/use-run-orchestration.ts` |
| Change retry behavior | `docs/specs/ASSISTANT-CONVERSATIONS.md` (§Retry) | `runs/use-run-orchestration.ts` (`handleRetry`), `runs/prepare-run-request.ts`, `runs/build-stream-request.ts` |
| Change revert behavior | `docs/specs/ASSISTANT-MESSAGES.md` (§Reverting the Conversation) | `runs/use-run-orchestration.ts` (`handleRevert` / `handleRestore` / commit on generate), `state/conversation-reducer.ts`, `ui/assistant-chat.tsx` (input wiring only) |

Paths under `libs/assistant-react` are relative to `src/lib/` unless noted.

## Do not reintroduce

- No `getChatStreamGenerator`, `getStreamGenerator`, or mutable transport slot.
  See `libs/ai/README.md` (§AIRuntime) and `libs/assistant/README.md`.
- Accept `engine.dispatch` before `submitTurn`.
  See `libs/assistant/README.md` (§Command ingress and duplicate runs).
- No `resolveDataAccess` and no submit-time data-access injection.
  See `libs/ai/README.md`.
- Keep the three store dispatch helpers.
  See `libs/assistant-react/README.md` (§Dispatch).
- No god `useAssistantChat`.
  See `libs/assistant-react/README.md` (§Composition).
- `@koloda/assistant-react` and `@koloda/ai-react` do not import `@koloda/app-react` or `@koloda/settings-react`.
