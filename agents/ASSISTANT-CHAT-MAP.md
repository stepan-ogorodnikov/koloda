# AI Chat - LLM Context Guide

Before modifying the assistant chat feature, read this map to load the correct spec and target the correct files. The behavioral rules live in the specs; do not infer them from the code.

**This map is the ownership source of truth.** Package READMEs (`libs/ai`, `libs/ai-react`) describe their own surface; if they disagree with the layer boundaries below, trust this map.

## Folder layout (`libs/srs-react/src/lib/assistant/`)

| Folder | Owns |
|--------|------|
| `state/` | Reducer, store, selectors, actions, messages, profile/config types, AI profile dual-write payloads (`ai-profile-sync`) |
| `runs/` | Session (`RunController`), orchestration, stream execution, pending-refs, `build-stream-request` |
| `persistence/` | Restore/saver hooks, coerce/normalize, save scheduler |
| `ui/` | Chat shell, lists, settings, message/card renderers, chrome |
| *(root)* | Profile cascade hooks (`use-assistant-profile-selection`, `use-global-ai-profile-state`, runtime config, client, prompt templates) |

## Task Routing Table

If your task matches one of these, read the specified doc first, then target the specified files.

| Task | Read First (Spec/Playbook) | Primary Files to Edit | Critical Invariant to Preserve |
|------|---------------------------|----------------------|-------------------------------|
| Add a new AI provider | agents/ADD-AI-PROVIDER.md | libs/ai/src/lib/provider-catalog.ts, provider-secrets.ts, libs/ai/src/lib/providers/<provider>.ts, provider-registry.ts, crates/koloda-core/src/domain/ai.rs | TS and Rust provider enums must stay in sync. One provider = one module under `providers/`; wire it in `provider-registry.ts`. |
| Fix streaming / chunk handling | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Runs, §During Streaming) | libs/ai chat-stream / card-generation; host `AIRuntime` adapters; `assistant/runs/use-conversation-runs.ts` (chunk/card dispatch) | Partial content preserved on failure/cancel. Provider HTTP runs in the host, not the renderer. |
| Change AIRuntime / key proxy | this map (§AIRuntime seam); libs/ai/README.md | libs/ai `runtime.ts`; core-react `aiRuntimeAtom`; Electron `ai-ipc` + renderer `ai-runtime`; demo `ai-runtime` | Renderer never gets usable `apiKey`. Streams correlate by `requestId` and support abort. |
| Change run lifecycle (start/cancel/fail) | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Runs) | `assistant/state/conversation-reducer.ts` (`transitionRun`, `submitTurn`), `runs/use-conversation-runs.ts`, `runs/use-run-orchestration.ts`, `@koloda/assistant` (`assistant-engine.ts` shutdown, `run-controller-registry.ts`) | A run has exactly one user msg and one assistant msg. Submit creates both + the run in one `submitTurn` dispatch. Status transitions go through `transitionRun` (streaming → success\|failed\|canceled\|interrupted; restart → streaming); illegal terminals are no-ops. Run execution + AbortControllers live in `@koloda/assistant` via `useAssistantEngineHost`; graceful shutdown interrupts with `app_shutdown` then aborts. |
| Change conversation history rules | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Conversation History) | `assistant/state/conversation-reducer.ts` (getVisibleMessages), `state/assistant-messages.ts`, `runs/use-run-orchestration.ts`, `runs/build-stream-request.ts` | "What the user sees is what the model gets" (incl. partial fails, excl. card outputs). |
| Change chat ↔ cards mode switching | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Mode Switching) | libs/ai-react/src/lib/ai-chat-mode-toggle.tsx; `assistant/state/conversation-actions.ts` (setMode), `state/conversation-selectors.ts` (effectiveMode), `state/assistant-messages.ts` (getEffectiveChatMode) | Mode is user-controlled only (toggle/hotkey/revert). Deck must be selected to toggle. Run completion does not change mode. |
| Change deck locking logic | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Deck Selection) | `assistant/state/conversation-reducer.ts`, `state/conversation-selectors.ts` (assistantIsLockedAtom), `state/conversation-actions.ts`; `persistence/use-conversation-restore.ts` | Locks on FIRST successful card run. Once locked, deck is immutable. |
| Fix AI profile state (profile/model/params) | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§AI Configuration) | libs/ai-react/src/lib/ai-model-profile-picker.tsx, ai-model-parameters.tsx; `assistant/use-assistant-profile-selection.ts`, `use-global-ai-profile-state.ts`, `state/ai-profile-sync.ts`, `use-assistant-runtime-config.ts`, `state/assistant-conversation-config.ts` | Changing profile resets model + params. Changing model resets params. Dual-write / last-used payloads live in `state/ai-profile-sync.ts`. Chat tree: sole `useAIProfiles` in profile selection; pass `profiles` into the picker as props. Picker dual-writes via selection; submit/retry via `useRememberLastUsedAIProfile`. Outside chat tree, `useGlobalAIProfileState` may subscribe for reconcile. |
| Empty chat / model picker when user has no AI profiles | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§AI Profile State), docs/specs/AI-PROVIDERS.md (§Adding a Profile) | `assistant/ui/assistant-no-profiles.tsx`, `ui/assistant-chat.tsx`; libs/ai-react/src/lib/ai-model-profile-picker.tsx; libs/app-react/src/lib/routes/_.ai.tsx, settings/settings-ai-add-profile.tsx | Messages empty state only when messages are empty and profiles list is loaded empty. Model picker empty popover whenever profiles are loaded empty. CTAs are local; add-profile dialog is injected from app-react; srs-react/ai-react must not import app-react. |
| Modify card generation parsing | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§During Streaming) | libs/ai/src/lib/card-generation.ts, card-parsing.ts | One shared path: structured stream → parse stream text → plain text fallback. |
| Change persistence / restore | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Persistence) | `@koloda/assistant` (`create-conversation-save-queue`, `create-save-scheduler`, `conversation-persistence-host`, `SHUTDOWN_FLUSH_TIMEOUT_MS`, `SHUTDOWN_SAVE_MAX_ATTEMPTS`); `assistant/persistence/` (`use-conversation-save-host`, `use-conversation-restore`, `conversation-persistence`); `assistant/runs/use-assistant-engine-host.ts` (engine + persistence singleton, graceful shutdown); drizzle/, crates/koloda-core/src/repo | Failed runs must not break conversation persistence. Per-conversation save queues and shutdown flush are engine-owned (`useAssistantEngineHost` + `useConversationSaveHost` write adapter); route/chat unmount does not dispose queues or abort runs. Failed saves retry with bounded backoff + jitter; UI exposes Retry save; delete cancels retry timers. Graceful shutdown: `interrupted`/`app_shutdown`, abort, bounded flush (`SHUTDOWN_FLUSH_TIMEOUT_MS` = 2s, `SHUTDOWN_SAVE_MAX_ATTEMPTS` = 3). |
| Choose conversation dispatch flavor | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Persistence, §During Streaming, §Revert) | `assistant/runs/use-assistant-session.ts` (helpers), `runs/use-conversation-runs.ts`, `runs/use-run-orchestration.ts` | Keep three named helpers — do not collapse into one options bag. `dispatch`: current convo + `touch()` (submit/cancel/commit). `dispatchToConversation(id)`: by-id, no auto-touch (stream chunks; terminal success/abort calls `touch()` explicitly). `dispatchLocal`: current convo, no save (in-memory revertState). |
| Change retry behavior | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Retry) | `assistant/runs/use-run-orchestration.ts` (handleRetry), `runs/use-conversation-runs.ts` (retryRun), `runs/build-stream-request.ts` | Retry reuses the run ID; mode is preserved from the original run. AI profile/model/params come from the **current** selection, not the original request. |
| Change revert behavior | docs/specs/ASSISTANT-CHAT-MESSAGES.md (§Reverting the Conversation), docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Revert) | `assistant/runs/use-run-orchestration.ts` (handleRevert/handleRestore/commit on generate), `state/conversation-reducer.ts`, `ui/assistant-chat.tsx` (input wiring only) | Revert is visual until the next submit commits it; earlier messages are untouched. Deck lock and deck contents are preserved. Re-triggered prompt starts a fresh run with a new run ID. |

## Layer Boundaries (Enforce these)

- libs/ai: Provider calls, streaming, zod schemas, `AIRuntime` contract. NO React, NO DB, NO run state.
- libs/ai-react: Shared AI UI primitives and streaming hooks. NO conversation store, NO DB schemas.
- libs/srs-react/.../assistant: Conversation store/reducer, run orchestration, chat UI. NO provider HTTP, NO DB schemas.
- crates/koloda-core: Source of truth for provider enum, secrets redaction, DB repo.
- Host apps: Own `AIRuntime` adapters and secret loading. Shared React calls by `profileId` only.

### AIRuntime seam

Shared React never builds provider clients or holds usable API keys.
Hosts inject `aiRuntimeAtom` (`libs/core-react`); assistant uses `useAssistantClient` → `AIRuntime`.

| Host | Adapter | Secrets |
|------|---------|---------|
| Electron | `apps/native-electron-react/.../ai-runtime.ts` over IPC; main `apps/native-electron/src/ai-ipc.ts` | Keyring via NAPI in main only |
| Demo | `apps/demo/src/app/ai-runtime.ts` | Host-local PGlite read at call time |

Public profile reads are redacted (`apiKey: null` + `hasSecrets`).
Settings add/replace still writes keys; edit UI uses `hasSecrets` for Replace.

### Composition

`AssistantChat` (`ui/`) wires `useAssistantProfileSelection` → `useConversationPersistence` → `useAssistantSession` directly.
Autosave mounts above chat via `useConversationSaveHost` (AI route + test harness).
Session returns a `RunController` (`runs/run-controller.ts`) plus template bits; UI and the test harness call through `controller.*`.
`useRunOrchestration` is private composition: session owns its deps object; do not treat the options bag as a public API.
Do not reintroduce a god `useAssistantChat` hook; integration tests use `ui/assistant-chat-test-harness.ts` only.

### Public surface (`@koloda/srs-react`)

App shells may import only:

- UI: `AssistantChat`, `AssistantConversationsList`, `AssistantNewConversationButton`, `ConversationHeaderMenu`, `CONVERSATION_TITLE_FALLBACK`
- State: `newConversationAtom`, `setAssistantDeckAtom`, `assistantDeckIdAtom`, `assistantIsLockedAtom`
- Profile: `useGlobalAIProfileState`
- Persistence host: `useConversationSaveHost` (mount on the AI route, above `AssistantChat`)
- Engine host: `useAssistantEngineHost` (mount on the AI route; run lifetime + graceful shutdown)

Conversation state internals live in `state/conversation-store.ts` / `state/conversation-selectors.ts` / `state/conversation-actions.ts` — import those directly inside the assistant folder.
Do not re-export them (or hooks/reducer/orchestration) from the package entry.
