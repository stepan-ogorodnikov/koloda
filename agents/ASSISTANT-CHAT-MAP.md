# AI Chat - LLM Context Guide

Before modifying the assistant chat feature, read this map to load the correct spec and target the correct files. The behavioral rules live in the specs; do not infer them from the code.

## Task Routing Table

If your task matches one of these, read the specified doc first, then target the specified files.

| Task | Read First (Spec/Playbook) | Primary Files to Edit | Critical Invariant to Preserve |
|------|---------------------------|----------------------|-------------------------------|
| Add a new AI provider | agents/ADD_AI_PROVIDER.md | libs/ai/src/lib/types.ts, provider-registry.ts, crates/koloda-core/src/domain/ai.rs | TS and Rust provider enums must stay in sync. |
| Fix streaming / chunk handling | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Runs, §During Streaming) | libs/ai/src/lib/chat-stream.ts, libs/ai-react/src/lib/use-chat-stream.ts | Partial content must be preserved on failure/cancel. |
| Change run lifecycle (start/cancel/fail) | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Runs) | libs/ai-react/src/lib/use-streaming-request.ts | A run has exactly one user msg and one assistant msg. |
| Change conversation history rules | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Conversation History) | libs/ai-react (atom state/reducer), libs/ai/src/lib/conversations.ts | "What the user sees is what the model gets" (incl. partial fails, excl. card outputs). |
| Change chat ⇄ cards mode switching | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Mode Switching) | libs/ai-react/src/lib/ai-chat-mode-toggle.tsx, deck-lock atoms | Auto-switch back to chat ONLY on success. Deck must be selected to toggle. |
| Change deck locking logic | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Deck Selection) | libs/ai-react (atoms), app layer (persistence) | Locks on FIRST successful card run. Once locked, deck is immutable. |
| Fix AI profile state (profile/model/params) | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§AI Configuration) | libs/ai-react/src/lib/ai-profile-picker.tsx, ai-model-picker.tsx, ai-model-parameters.tsx; libs/srs-react/src/lib/assistant/use-assistant-profile-selection.ts, use-assistant-runtime-config.ts, assistant-conversation-config.ts | Changing profile resets model + params. Changing model resets params. |
| Modify card generation parsing | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§During Streaming) | libs/ai/src/lib/card-generation.ts, card-parsing.ts | Structured streaming (OpenRouter) vs Text completion (Ollama/LMStudio). |
| Change persistence / restore | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Persistence) | drizzle/, crates/koloda-core/src/repo, app layer | Failed runs must not break conversation persistence. |
| Change retry behavior | docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Retry) | libs/srs-react/src/lib/assistant/use-assistant-chat.ts (handleRetry), use-conversation-runs.ts (retryRun) | Retry reuses the run ID; mode is preserved from the original run. AI profile/model/params come from the **current** selection, not the original request. |
| Change revert behavior | docs/specs/ASSISTANT-CHAT-MESSAGES.md (§Reverting the Conversation), docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md (§Revert) | libs/ai-react (state/reducer for the rewound conversation), libs/srs-react/src/lib/assistant (revert handler, similar to handleRetry/handleClone), user-message component in app layer | Revert removes the target user message and everything after it; earlier messages are untouched. Deck lock and deck contents are preserved. Re-triggered prompt starts a fresh run with a new run ID. |

## Layer Boundaries (Enforce these)

- libs/ai: Provider calls, streaming, zod schemas. NO React, NO DB, NO run state.
- libs/ai-react: Run state machine, atoms, UI. NO HTTP calls, NO DB schemas.
- crates/koloda-core: Source of truth for provider enum, secrets redaction, DB repo.
