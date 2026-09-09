# @koloda/ai-react

Shared React UI primitives and streaming transport hooks for assistant chat. Presentational components and abortable stream helpers only — no conversation store, no run lifecycle, no persistence.

## Where it sits

Consumed by `@koloda/assistant-react` and `@koloda/settings-react` (and apps that compose those surfaces). Depends on `@koloda/ai`, `@koloda/core-react`, and `@koloda/ui`. Conversation state, orchestration, and persistence live in `libs/assistant-react/src/lib/assistant/`.

**Ownership source of truth:** `agents/ASSISTANT-MAP.md` — prefer that map over this README when routing edits.

## Architectural Map

- Streaming transport: `use-streaming-request.ts` (generic abortable stream → success | aborted | error) and `use-chat-stream.ts`. Callers in assistant-react feed chunks into the conversation reducer.
- AI configuration UI: `ai-model-profile-picker.tsx` (presentational — takes `profiles` props; does not call `useAIProfiles`), `ai-model-parameters.tsx`, `use-ai-profiles.ts`, `use-ai-models.ts`, `use-ai-profiles-models.ts`. Cascade reset and the chat-tree `useAIProfiles` subscription are owned by assistant-react profile selection.
- Message list shell: `ai-chat-messages.tsx`, `ai-chat-message.tsx`, status/error/elapsed helpers — layout only; message domain rendering is in assistant-react.
- Input & validation: `ai-chat-prompt-panel.tsx`, `use-ai-chat-input.ts`, `use-ai-chat-validation.ts`, submit/footer/settings-toggle primitives.
- Scroll: `use-auto-scroll.ts`.

### Does NOT own (prevent scope creep)

- Conversation / run lifecycle state — `libs/assistant-react/.../assistant`
- Revert — `libs/assistant-react/.../assistant`
- Provider HTTP calls — `@koloda/ai`
- Secrets storage / redaction — `crates/koloda`
- Persistence schema — `@koloda/db-sqlite`, `koloda`
- SRS deck data — `libs/srs`

## Read next

- `agents/ASSISTANT-MAP.md` — task routing and layer boundaries
- `docs/specs/ASSISTANT-CONVERSATIONS.md` — behavioral rules the chat feature implements
