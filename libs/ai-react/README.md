# @koloda/ai-react

Shared React UI primitives and streaming transport hooks for assistant chat. Presentational components and abortable stream helpers only — no conversation store, no run lifecycle, no deck locking, no persistence.

## Where it sits

Consumed by `libs/srs-react/.../assistant` (and apps that compose those surfaces). Calls into `@koloda/ai` for provider types, profile/model queries, and stream executors. Conversation state, orchestration, and persistence live in `libs/srs-react/src/lib/assistant/`.

**Ownership source of truth:** `agents/ASSISTANT-CHAT-MAP.md` — prefer that map over this README when routing edits.

## Architectural Map

- Streaming transport: `use-streaming-request.ts` (generic abortable stream → success | aborted | error), `use-chat-stream.ts` (chat mode), and `use-assistant-card-generation.ts` (cards mode). Callers in srs-react feed chunks/cards into the conversation reducer.
- Mode toggle UI: `ai-chat-mode-toggle.tsx` — controlled component; `AIChatMode` type lives in `@koloda/ai` (re-exported from `types.ts` for convenience). Mode/deck-lock rules live in srs-react.
- AI configuration UI: `ai-model-profile-picker.tsx` (presentational — takes `profiles` props; does not call `useAIProfiles`), `ai-model-parameters.tsx`, `use-ai-profiles.ts`, `use-ai-models.ts`, `use-ai-profiles-models.ts`. Cascade reset and the chat-tree `useAIProfiles` subscription are owned by srs-react profile selection.
- Message list shell: `ai-chat-messages.tsx`, `ai-chat-message.tsx`, status/error/elapsed helpers — layout only; message domain rendering is in srs-react.
- Input & validation: `ai-chat-prompt-panel.tsx`, `use-ai-chat-input.ts`, `use-ai-chat-validation.ts`, submit/footer/settings-toggle primitives.
- Scroll: `use-auto-scroll.ts`.

### Does NOT own (prevent scope creep)

- Conversation / run lifecycle state — `libs/srs-react/.../assistant`
- Mode switching policy, deck locking, revert — `libs/srs-react/.../assistant`
- Provider HTTP calls — `@koloda/ai`
- Secrets storage / redaction — `crates/koloda-core`
- Persistence schema — `drizzle/`
- SRS deck data — `libs/srs`

## Read next

- `agents/ASSISTANT-CHAT-MAP.md` — task routing and layer boundaries
- `docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md` — behavioral rules the chat feature implements
