# @koloda/ai-react

React binding for the assistant chat feature. Owns the runtime state of the assistant chat (runs, streaming, modes, deck locking, AI config); delegates persistence to the app layer and provider calls to @koloda/ai.

## Where it sits

Consumed only by `apps/*`. It is the sole consumer of `@koloda/ai`. State is held in atoms; UI subscribes via hooks. Persistence and restore are delegated to the app layer, which calls into `crates/koloda-core` through Tauri commands.

## Architectural Map

- Run lifecycle & streaming: `use-streaming-request.ts` (the streaming → success | failed | canceled state machine) and `use-chat-stream.ts` (feeds chunks into state).
- Mode & deck rules: ai-chat-mode-toggle.tsx and deck-lock atoms (chat ⇄ cards transitions, "auto-switch back to chat on success" rule).
- AI configuration: `ai-model-profile-picker.tsx`, ai-model-parameters.tsx (profile sections → model → params reset cascade).
- Message rendering: `ai-chat-messages.tsx` (list) and `ai-chat-message.tsx` (bubbles / card tables).
- Input & validation: `ai-chat-prompt-panel.tsx` (container), `use-ai-chat-validation.ts` (send-enabled rules).

### Does NOT own (prevent scope creep)

- Provider HTTP calls — `@koloda/ai`
- Secrets storage / redaction — `crates/koloda-core`
- Persistence schema — `drizzle/`
- SRS deck data — `libs/srs`

## Read next

- `docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md` — the behavior this UI implements
