# @koloda/ai-react

Shared presentational AI UI for assistant chat — chat chrome, message shells, tool-activity widget, and profile/model pickers. No conversation store, no run lifecycle, no stream transport, no persistence.

## Where it sits

Consumed by `@koloda/assistant-react` and `@koloda/settings-react` (and apps that compose those surfaces). Depends on `@koloda/ai`, `@koloda/core-react`, and `@koloda/ui`. Conversation state, orchestration, and persistence live in `libs/assistant-react/src/lib/`.

**Task routing:** `agents/ASSISTANT-MAP.md`.
This README owns the package boundary.

## Architectural Map

- Tool activity: `ai-tool-activity.tsx` — renders run activity rows (reasoning / tool calls) from `calls` props; markdown via an injected `renderText`.
- Context usage: `ai-chat-context-usage.tsx` — token counter from `usage` / `contextLength` props.
- AI configuration UI: `ai-model-profile-picker.tsx` (presentational — takes `profiles` props; does not call `useAIProfiles`), `ai-model-parameters.tsx`, `use-ai-profiles.ts`, `use-ai-models.ts`, `use-ai-profiles-models.ts`. Cascade reset and the chat-tree `useAIProfiles` subscription are owned by assistant-react profile selection.
- Message list shell: `ai-chat-messages.tsx`, `ai-chat-message.tsx`, status/error/elapsed helpers — layout only; message domain rendering is in assistant-react.
- Input & validation: `ai-chat-prompt-panel.tsx`, `use-ai-chat-input.ts`, `use-ai-chat-validation.ts`, submit/footer/settings-toggle primitives.
- Scroll: `use-auto-scroll.ts`.

### Does NOT own (prevent scope creep)

- Conversation / run lifecycle state — `libs/assistant-react/src/lib`
- Revert — `libs/assistant-react/src/lib`
- Stream transport / run execution (AbortControllers, chunk pumping) — `@koloda/assistant`, bound to host `AIRuntime` adapters
- Provider HTTP calls — `@koloda/ai`
- Secrets storage / redaction — `crates/koloda`
- Persistence schema — `@koloda/db-sqlite`, `koloda`
- SRS deck data — `libs/srs`

## Read next

- `agents/ASSISTANT-MAP.md` — task routing
- `docs/specs/ASSISTANT-CONVERSATIONS.md` — AI profile state the pickers implement
