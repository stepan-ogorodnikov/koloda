# @koloda/assistant-react

Assistant chat React layer: conversation store, session/`RunController`, persistence host, and chat UI.

## Where it sits

Consumed by `@koloda/app-react` and `apps/electron-react` (graceful shutdown).
Depends on `@koloda/app`, `@koloda/srs`, `@koloda/ai`, `@koloda/ai-react`, `@koloda/assistant`, `@koloda/core-react`, and `@koloda/ui`.
Provider HTTP stays in `@koloda/ai`; run execution lifetime and stream transport live in `@koloda/assistant`; this package owns conversation policy and React hosts.

**Task routing:** `agents/ASSISTANT-MAP.md`.
This README owns the package boundary.

## Architectural Map

- Layout under `src/lib/`: `state/` (reducer, store, actions, selectors, messages), `runs/` (engine host adapter, session/`RunController`, orchestration, `build-stream-request`), `persistence/` (restore, save write adapter, coerce/normalize), `ui/` (chat shell, lists, settings, renderers); profile cascade hooks at `src/lib/` root (`use-assistant-profile-selection.ts`, `use-global-ai-profile-state.ts`, `use-assistant-runtime-config.ts`).

### Does NOT own (prevent scope creep)

- Framework-free run orchestration, persistence scheduling, AbortController lifetime, graceful shutdown — `@koloda/assistant` (wired via `useAssistantEngineHost`)
- Provider HTTP / client factory — `@koloda/ai`
- Presentational chat chrome and AI UI primitives — `@koloda/ai-react`
- App routing, global hotkeys, application-shell assistant host mount — `@koloda/app-react`
- Global settings screens — `@koloda/settings-react`
- SRS screens — `@koloda/srs-react`
- SQLite schema / Rust repos — `@koloda/db-sqlite`, `koloda`
- Layout primitives — `@koloda/ui`
- Importing `@koloda/app-react` or `@koloda/settings-react`.
  The add-profile dialog is injected from the app-react route.

## Dispatch

Keep three named store helpers.
Do not collapse them into one options bag.

- `dispatch` — current conversation, and `touch()` for submit, cancel, and commit.
- `dispatchToConversation(id)` — by id, no auto-touch.
  Engine events and stream chunks land here.
- `dispatchLocal` — current conversation, no save.
  In-memory revert uses this.

Engine execution ingress is separate: `engine.dispatch(AssistantCommand)` via `useConversationRuns`.
`use-conversation-runs.ts` only returns `engine.dispatch`.
Do not put chunk dispatch or run lifecycle there.

## Composition

`AssistantChat` wires `useAssistantProfileSelection`, then `useConversationPersistence`, then `useAssistantSession`.
Autosave and the engine host mount on the application shell.
That mount is `useConversationSaveHost` and `useAssistantEngineHost` in `App` (`@koloda/app-react`).
The test harness mirrors that mount.
Session returns a `RunController` (`runs/run-controller.ts`).
UI and the test harness call through `controller.*`.
`useRunOrchestration` is private.
Session owns its deps object.
Do not treat that options bag as a public API.
Submit path: `prepareRunRequest`, then `engine.dispatch(submit)` which must accept, then one `submitTurn`.
`rollbackSubmitTurn` runs if the pending command later rejects.
Do not reintroduce a god `useAssistantChat` hook.
Integration tests use `ui/assistant-chat-test-harness.ts` only.

## Public surface

App shells may import only:

- UI: `AssistantChat`, `AssistantConversationsList`, `AssistantNewConversationButton`
- UI: `ConversationHeaderMenu`, `CONVERSATION_TITLE_FALLBACK`
- State: `startParamlessConversationAtom`
  `newConversationAtom` stays internal to the recovery screen.
- Persistence host: `useConversationSaveHost` (application shell, not the AI route)
- Engine host: `useAssistantEngineHost`, `shutdownAssistantGracefully` (application shell)

Conversation state internals stay inside the package lib folder:
`state/conversation-store.ts`, `state/conversation-selectors.ts`, and `state/conversation-actions.ts`.
Import those directly inside the package lib folder.
Do not re-export them, or hooks, the reducer, or orchestration, from the package entry.

## Read next

- `agents/ASSISTANT-MAP.md` — task routing
- `agents/ADD-ASSISTANT-TOOL.md` — adding a chat tool (wire names, run mapping, query invalidation)
- `docs/specs/ASSISTANT-CONVERSATION-LIST.md`
- `docs/specs/ASSISTANT-CONVERSATIONS.md`
- `docs/specs/ASSISTANT-MESSAGES.md`
- `docs/specs/ASSISTANT-CARD-GENERATION.md`
- `agents/I18N.md` — strings in feature UI
