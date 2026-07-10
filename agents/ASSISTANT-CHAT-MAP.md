# AI Chat - LLM Context Guide

Before modifying the assistant chat feature, read this map to load the correct spec and target the correct files. The behavioral rules live in the specs; do not infer them from the code.

**This map is the ownership source of truth.** Package READMEs (`libs/ai`, `libs/ai-react`) describe their own surface; if they disagree with the layer boundaries below, trust this map.

## Task Routing Table

If your task matches one of these, read the specified doc first, then target the specified files.

| Task | Read First (Spec/Playbook) | Primary Files to Edit | Critical Invariant to Preserve |
|------|---------------------------|----------------------|-------------------------------|
| Add a new AI provider | agents/ADD_AI_PROVIDER.md | libs/ai/src/lib/types.ts, provider-registry.ts, crates/koloda-core/src/domain/ai.rs | TS and Rust provider enums must stay in sync. |
| Fix streaming / chunk handling | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Runs, §During Streaming) | libs/ai/src/lib/chat-stream.ts, libs/ai-react/src/lib/use-chat-stream.ts | Partial content must be preserved on failure/cancel. |
| Change run lifecycle (start/cancel/fail) | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Runs) | libs/srs-react/src/lib/assistant/conversation-reducer.ts, use-conversation-runs.ts, use-run-orchestration.ts; libs/ai-react/src/lib/use-streaming-request.ts (transport) | A run has exactly one user msg and one assistant msg. Stream transport + run execution live in `use-conversation-runs.ts`. |
| Change conversation history rules | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Conversation History) | libs/srs-react/src/lib/assistant/conversation-reducer.ts (getVisibleMessages), assistant-messages.ts, use-run-orchestration.ts, build-stream-request.ts | "What the user sees is what the model gets" (incl. partial fails, excl. card outputs). |
| Change chat ↔ cards mode switching | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Mode Switching) | libs/ai-react/src/lib/ai-chat-mode-toggle.tsx; libs/srs-react/src/lib/assistant/conversation-actions.ts (setMode), conversation-selectors.ts (effectiveMode), assistant-messages.ts (getEffectiveChatMode) | Mode is user-controlled only (toggle/hotkey/revert). Deck must be selected to toggle. Run completion does not change mode. |
| Change deck locking logic | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Deck Selection) | libs/srs-react/src/lib/assistant/conversation-reducer.ts, conversation-selectors.ts (assistantIsLockedAtom), conversation-actions.ts; use-conversation-persistence.ts | Locks on FIRST successful card run. Once locked, deck is immutable. |
| Fix AI profile state (profile/model/params) | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§AI Configuration) | libs/ai-react/src/lib/ai-model-profile-picker.tsx, ai-model-parameters.tsx; libs/srs-react/src/lib/assistant/use-assistant-profile-selection.ts, use-assistant-runtime-config.ts, use-global-ai-profile-state.ts, assistant-conversation-config.ts | Changing profile resets model + params. Changing model resets params. Chat tree owns one `useAIProfiles` via profile selection; use `useSetGlobalAIProfileState` for writes. |
| Modify card generation parsing | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§During Streaming) | libs/ai/src/lib/card-generation.ts, card-parsing.ts | Structured streaming (OpenRouter) vs Text completion (Ollama/LMStudio). |
| Change persistence / restore | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Persistence) | libs/srs-react/src/lib/assistant/use-conversation-persistence.ts, conversation-persistence.ts (coerce/normalize/cancelStreaming); drizzle/, crates/koloda-core/src/repo | Failed runs must not break conversation persistence. |
| Change retry behavior | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Retry) | libs/srs-react/src/lib/assistant/use-run-orchestration.ts (handleRetry), use-conversation-runs.ts (retryRun), build-stream-request.ts | Retry reuses the run ID; mode is preserved from the original run. AI profile/model/params come from the **current** selection, not the original request. |
| Change revert behavior | docs/specs/ASSISTANT-CHAT-MESSAGES.md (§Reverting the Conversation), docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Revert) | libs/srs-react/src/lib/assistant/use-run-orchestration.ts (handleRevert/handleRestore/commit on generate), conversation-reducer.ts, assistant-chat.tsx (input wiring only) | Revert is visual until the next submit commits it; earlier messages are untouched. Deck lock and deck contents are preserved. Re-triggered prompt starts a fresh run with a new run ID. |

## Layer Boundaries (Enforce these)

- libs/ai: Provider calls, streaming, zod schemas. NO React, NO DB, NO run state.
- libs/ai-react: Shared AI UI primitives and streaming hooks. NO conversation store, NO DB schemas.
- libs/srs-react/.../assistant: Conversation store/reducer, run orchestration, chat UI. NO provider HTTP, NO DB schemas.
- crates/koloda-core: Source of truth for provider enum, secrets redaction, DB repo.
