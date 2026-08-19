# AI Chat - LLM Context Guide

Before modifying the assistant chat feature, read this map to load the correct spec and target the correct files.
The behavioral rules live in the specs; do not infer them from the code.

**This map is the ownership source of truth.**
Package READMEs (`libs/ai`, `libs/ai-react`, `libs/assistant`) describe their own surface.
If they disagree with the layer boundaries below, trust this map.

## Folder layout (`libs/srs-react/src/lib/assistant/`)

| Folder | Owns |
|--------|------|
| `state/` | Reducer, store, selectors, actions, messages, profile/config types, AI profile dual-write payloads (`ai-profile-sync`) |
| `runs/` | Session (`RunController`), orchestration, engine host, command prep (`prepare-run-request` / `build-stream-request`), restore-only `dataAccess` snapshot types (`data-access`), thin `engine.dispatch` adapter |
| `persistence/` | Restore/saver hooks, coerce/normalize, `schemaVersion` migrations, save host adapter |
| `ui/` | Chat shell, lists, settings, message/card renderers (incl. tool-activity wiring), chrome |
| *(root)* | Profile cascade hooks (`use-assistant-profile-selection`, `use-global-ai-profile-state`), runtime config, client, prompt templates |

Stream execution, AbortControllers, serial queues, and save scheduling live in `@koloda/assistant`, not in `runs/`.
`use-conversation-runs.ts` is only a React adapter that returns `engine.dispatch`.
Do not put chunk dispatch or run lifecycle there.

## Task Routing Table

If your task matches one of these, read the specified doc first, then target the specified files.

| Task | Read First (Spec/Playbook) | Primary Files to Edit | Critical Invariant to Preserve |
|------|---------------------------|----------------------|-------------------------------|
| Add a new AI provider | agents/ADD-AI-PROVIDER.md | libs/ai/src/lib/provider-catalog.ts, provider-secrets.ts, libs/ai/src/lib/providers/<provider>.ts, provider-registry.ts, crates/koloda-core/src/domain/ai.rs | TS and Rust provider enums must stay in sync. One provider = one module under `providers/`; wire it in `provider-registry.ts`. |
| Fix streaming / chunk handling | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Runs, §During Streaming) | `@koloda/assistant` (`run-stream.ts`, `conversation-runtime.ts`, `assistant-execution-port.ts`); host execution port in `runs/use-assistant-engine-host.ts`; request prep in `runs/prepare-run-request.ts` | Partial content preserved on failure/cancel. Provider HTTP runs in the host via the application-scoped execution port. Commands carry immutable `AssistantExecutionIdentity`. There is no mutable transport slot and no `getChatStreamGenerator` / `getStreamGenerator`. |
| Change AIRuntime / key proxy | this map (§AIRuntime seam); libs/ai/README.md | libs/ai `runtime.ts`; core-react `aiRuntimeAtom`; Electron `ai-ipc` + renderer `ai-runtime`; demo `ai-runtime` | Renderer never gets usable `apiKey`. Streams correlate by `requestId` and support abort. The execution port resolves credentials from `identity.profileId` at call time. |
| Change run lifecycle (start/cancel/fail) | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Runs) | `assistant/state/conversation-reducer.ts` (`transitionRun`, `submitTurn`, `rollbackSubmitTurn`); `runs/use-run-orchestration.ts`; `runs/prepare-run-request.ts`; `@koloda/assistant` (`assistant-engine.ts` `dispatch`, `conversation-runtime.ts`, `run-controller-registry.ts`) | A run has exactly one user msg and one assistant msg. Orchestration accepts the engine command first, then applies one `submitTurn`; `rollbackSubmitTurn` is the safety net if the command later rejects. Status transitions go through `transitionRun`. AbortControllers live in `@koloda/assistant`. Duplicate execute/retry is rejected (`AssistantDuplicateRunError`) before occupancy is claimed. Graceful shutdown interrupts with `app_shutdown` then aborts. |
| Change conversation history rules | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Conversation History) | `assistant/state/conversation-reducer.ts` (getVisibleMessages), `state/assistant-messages.ts`, `runs/use-run-orchestration.ts`, `runs/prepare-run-request.ts`, `runs/build-stream-request.ts` | "What the user sees is what the model gets": include leftover assistant text (incl. partial fails) and successful cards serialized as markdown (table first, leftover text second). Exclude tool traffic and failed/canceled card outputs. Tool rows live on the run record; follow-up requests do not resend them. Chat proposals serialize against `run.templateFields`, not the conversation's current template. |
| Change assistant data access (chat tools, historical snapshots) | docs/specs/ASSISTANT-DATA-ACCESS.md | Tools: libs/ai `assistant-tools.ts` (specs + binder + output shaping) + `chat-stream.ts` (`fullStream` / `onToolEvent`); host executors (demo `ai-runtime`, Electron `ai-ipc` over `KolodaDb`); renderer `waitForStream` mapping; `@koloda/assistant` (`RunChunk` tool kinds, `assistant-execution-port.ts`, `conversation-runtime.ts`); `runs/build-stream-request.ts` (tool names); `runs/use-run-orchestration.ts` (no `resolveDataAccess`); `assistant/state/conversation-reducer.ts` (`toolCalls`, `addToolCall` / `setToolCallResult`, `writeTargetDeckId`, `writeTargetTemplateId`); `runs/assistant-event-to-action.ts`; libs/ai-react `ai-tool-activity.tsx`; `ui/use-assistant-message-renderer.tsx`; persistence `runSchema.toolCalls` / optional `dataAccess`. Restore-only snapshot types: `assistant/runs/data-access.ts`. | Always on — no consent, modes, or settings. Names-only tools (`list_decks`, `get_deck_cards`, `propose_cards`); decks are discovered via tools, not compiled into the system prompt; card bodies reach only via `get_deck_cards`; reach/egress at tool execution; budgets in tool output (200-card cap, 8,000-char list); activity visible on the run, not in follow-up history; retry re-executes fresh; old `dataAccess` snapshots are inert; no injected fallback (incapable models surface the provider error). Do not reintroduce submit-time injection. Hosts bind executors; libs/ai has schemas/shaping only. `prepareRunRequest` / `buildStreamRequest` stay framework-free. Persistence: optional `toolCalls` / `dataAccess`, no `schemaVersion` bump; malformed values fail as corrupt. Crash-restore flips in-flight `running` tool calls to `error`. |
| Change mixed chat / card-proposal rendering | docs/specs/ASSISTANT-CHAT-MESSAGES.md (§Message Display), docs/specs/ASSISTANT-CHAT-CARD-GENERATION.md | `ui/use-assistant-message-renderer.tsx`, `ui/assistant-cards-message.tsx`, `state/assistant-messages.ts` | Runs are `chat-text`. One turn may be tool rows + review table + leftover text (table first). The table is `run.cards` on that turn. Add uses write targets only. There is no chat/cards toggle. |
| Change deck locking logic | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Deck Selection) | `assistant/state/conversation-reducer.ts`, `state/conversation-selectors.ts` (assistantIsLockedAtom), `state/conversation-actions.ts`; `persistence/use-conversation-restore.ts` | Locks on FIRST successful card-bearing run. Partial cards on failed/canceled/interrupted do not lock. Add uses `writeTargetDeckId` and `writeTargetTemplateId`, not `conversation.deckId`. First successful proposal aligns `conversation.deckId` if unlocked. Once locked, deck is immutable. |
| Fix AI profile state (profile/model/params) | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§AI Configuration) | libs/ai-react/src/lib/ai-model-profile-picker.tsx, ai-model-parameters.tsx; `assistant/use-assistant-profile-selection.ts`, `use-global-ai-profile-state.ts`, `state/ai-profile-sync.ts`, `use-assistant-runtime-config.ts`, `state/assistant-conversation-config.ts` | Changing profile resets model + params. Changing model resets params. Dual-write / last-used payloads live in `state/ai-profile-sync.ts`. Chat tree: sole `useAIProfiles` in profile selection; pass `profiles` into the picker as props. Picker dual-writes via selection; submit/retry via `useRememberLastUsedAIProfile`. Outside chat tree, `useGlobalAIProfileState` may subscribe for reconcile. |
| Empty chat / model picker when user has no AI profiles | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§AI Profile State), docs/specs/AI-PROVIDERS.md (§Adding a Profile) | `assistant/ui/assistant-no-profiles.tsx`, `ui/assistant-chat.tsx`; libs/ai-react/src/lib/ai-model-profile-picker.tsx; libs/app-react/src/lib/routes/_.ai.tsx, settings/settings-ai-add-profile.tsx | Messages empty state only when messages are empty and profiles list is loaded empty. Model picker empty popover whenever profiles are loaded empty. CTAs are local; add-profile dialog is injected from app-react; srs-react/ai-react must not import app-react. |
| Modify card proposal parsing | docs/specs/ASSISTANT-CHAT-CARD-GENERATION.md, docs/specs/ASSISTANT-DATA-ACCESS.md | libs/ai `assistant-tools.ts` (`propose_cards` coerce/shape); host executors; reducer `applyProposeCardsToRun` | Cards leave the model as `propose_cards` arguments, not markdown scraping and not a second generation stream. Empty or invalid proposals do not create a table. First write target wins. |
| Change persistence / restore | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Persistence, §Restore) | `@koloda/assistant` (`create-conversation-save-queue`, `create-save-scheduler`, `conversation-persistence-host`, `assistant-observability`, `SHUTDOWN_FLUSH_TIMEOUT_MS`, `SHUTDOWN_SAVE_MAX_ATTEMPTS`); `assistant/persistence/` (`use-conversation-save-host`, `use-conversation-restore`, `conversation-persistence`, `conversation-persistence-schema`, `conversation-schema-version`); `assistant/runs/use-assistant-engine-host.ts` (engine + persistence singleton, graceful shutdown, `deleteAssistantConversation`); `@koloda/app-react` `components/app.tsx` (shell-scoped host mount); Electron close handshake `apps/native-electron/src/window-close-coordinator.ts` + `apps/native-electron-react/.../electron-close-coordination.ts`; drizzle/, crates/koloda-core/src/repo | Failed runs must not break conversation persistence. Persisted rows carry `schemaVersion`; coerce returns a discriminated restore result (`ok` / `missing` / `unsupportedVersion` / `corrupt`). Unsupported or corrupt rows are blocked from autosave, not treated as empty conversations. Strict run lifecycle validation rejects illegal status/reason pairs. On restore, streaming checkpoints become `interrupted`/`crash_recovery` with partial output kept. Per-conversation save queues and shutdown flush are engine-owned at **application-shell** scope. Production delete: success is `beginDelete` → DB delete → `commit` → `disposeConversation` (run keys remain) → drop store/query; failure is `rollback` only (clear provisional tombstone, preserve dirty, resume autosave) — no dispose/remove. `prepareDelete` is a permanent-tombstone helper (`beginDelete` + `commit`) for callers that cannot roll back — not the production path. Structured persistence logs: `saveStart`/`saveAck`/`saveFailed`, `deleteBegin`/`deleteCommit`/`deleteRollback`. Graceful shutdown: `interrupted`/`app_shutdown`, abort, bounded flush (`SHUTDOWN_FLUSH_TIMEOUT_MS` = 2s, `SHUTDOWN_SAVE_MAX_ATTEMPTS` = 3), single-flight. Browser unload is best-effort; Electron main awaits a bounded renderer ack (`WINDOW_CLOSE_SHUTDOWN_TIMEOUT_MS` = 2.5s). A bfcache `pagehide` (`persisted === true`) skips terminal shutdown. |
| Choose conversation dispatch flavor | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Persistence, §During Streaming, §Revert) | `assistant/runs/use-assistant-session.ts` (store helpers), `state/conversation-store.ts` (`dispatchToConversation` / `dispatchToConversationOnStore`), `runs/use-run-orchestration.ts` | Keep three named **store** helpers — do not collapse into one options bag. `dispatch`: current convo + `touch()` (submit/cancel/commit). `dispatchToConversation(id)`: by-id, no auto-touch (engine events and stream chunks land here via the Jotai adapter). `dispatchLocal`: current convo, no save (in-memory revertState). Engine execution ingress is separate: `engine.dispatch(AssistantCommand)` via `useConversationRuns`. |
| Change retry behavior | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Retry) | `assistant/runs/use-run-orchestration.ts` (handleRetry), `runs/prepare-run-request.ts`, `runs/build-stream-request.ts` | Retry reuses the run ID. Every retry is chat+tools. AI profile/model/params come from the **current** selection, not the original request. Stored `dataAccess` is inert. Retry is available for failed, canceled, and interrupted runs only — completed (success) runs are not retryable unless a separate regenerate feature is introduced. |
| Change revert behavior | docs/specs/ASSISTANT-CHAT-MESSAGES.md (§Reverting the Conversation), docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Revert) | `assistant/runs/use-run-orchestration.ts` (handleRevert/handleRestore/commit on generate), `state/conversation-reducer.ts`, `ui/assistant-chat.tsx` (input wiring only) | Revert is visual until the next submit commits it; earlier messages are untouched. Deck lock and deck contents are preserved. Re-triggered prompt starts a fresh chat run with a new run ID. |

## Layer Boundaries (Enforce these)

- libs/ai: Provider calls, streaming, zod schemas, tool specs/binder/output shaping, `AIRuntime` contract. NO React, NO DB, NO run state, NO tool I/O.
- libs/ai-react: Shared AI UI primitives and streaming hooks (incl. tool-activity widget). NO conversation store, NO DB schemas.
- `@koloda/assistant`: Run execution lifetime, serial command queues, AbortControllers, save scheduling, graceful shutdown. NO React, NO Jotai, NO repository I/O. Conversation documents stay in `@koloda/srs-react`.
- libs/srs-react/.../assistant: Conversation store/reducer, run orchestration, chat UI. NO provider HTTP, NO DB schemas.
- crates/koloda-core: Source of truth for provider enum, secrets redaction, DB repo.
- Host apps: Own `AIRuntime` adapters, secret loading, and assistant tool executors. Shared React calls by `profileId` only; chat requests carry tool names only.

### AIRuntime seam

Shared React never builds provider clients or holds usable API keys.
Hosts inject `aiRuntimeAtom` (`libs/core-react`); assistant uses `useAssistantClient` → `AIRuntime`.
The application-shell engine host builds one `AssistantExecutionPort` that calls `AIRuntime` with the command's `profileId`.
Do not reintroduce a module-level generator slot or optional `execution` / stream-generator getters.

| Host | Adapter | Secrets |
|------|---------|---------|
| Electron | `apps/native-electron-react/.../ai-runtime.ts` over IPC; main `apps/native-electron/src/ai-ipc.ts`; window-close handshake `window-close-coordinator.ts` ↔ `electron-close-coordination.ts` | Keyring via NAPI in main only |
| Demo | `apps/demo/src/app/ai-runtime.ts` | Host-local PGlite read at call time |

Public profile reads are redacted (`apiKey: null` + `hasSecrets`).
Settings add/replace still writes keys; edit UI uses `hasSecrets` for Replace.

### Composition

`AssistantChat` (`ui/`) wires `useAssistantProfileSelection` → `useConversationPersistence` → `useAssistantSession` directly.
Autosave + engine hosts mount on the application shell via `useConversationSaveHost` / `useAssistantEngineHost` (`App` in `@koloda/app-react`; test harness mirrors that).
Session returns a `RunController` (`runs/run-controller.ts`); UI and the test harness call through `controller.*`.
`useRunOrchestration` is private composition: session owns its deps object; do not treat the options bag as a public API.
Submit path: `prepareRunRequest` → `engine.dispatch(submit)` (must accept) → one `submitTurn`; `rollbackSubmitTurn` if the pending command later rejects.
Do not reintroduce a god `useAssistantChat` hook; integration tests use `ui/assistant-chat-test-harness.ts` only.

### Public surface (`@koloda/srs-react`)

App shells may import only:

- UI: `AssistantChat`, `AssistantConversationsList`, `AssistantNewConversationButton`, `ConversationHeaderMenu`, `CONVERSATION_TITLE_FALLBACK`
- State: `newConversationAtom`, `setAssistantDeckAtom`
- Profile: `useGlobalAIProfileState`
- Persistence host: `useConversationSaveHost` (mount on the application shell, not the AI route)
- Engine host: `useAssistantEngineHost` (mount on the application shell; run lifetime + best-effort unload shutdown)

Conversation state internals live in `state/conversation-store.ts` / `state/conversation-selectors.ts` / `state/conversation-actions.ts` — import those directly inside the assistant folder.
Do not re-export them (or hooks/reducer/orchestration) from the package entry.
