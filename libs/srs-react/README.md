# @koloda/srs-react

SRS feature React UI: decks, cards, lessons, templates, algorithms, and the full assistant chat feature (conversation store, run orchestration, persistence hooks).

## Where it sits

Consumed by `@koloda/app-react` route files.
Depends on `@koloda/app`, `@koloda/srs`, `@koloda/ai`, `@koloda/ai-react`, `@koloda/core-react`, and `@koloda/ui`.
Provider HTTP and generic stream hooks stay in `@koloda/ai` / `@koloda/ai-react`; this package owns conversation policy and SRS screens.

**Ownership source of truth for assistant chat:** `agents/ASSISTANT-CHAT-MAP.md` — prefer that map over this README when routing assistant edits.

## Architectural Map

- Algorithms / templates / decks / cards / lessons: folders under `src/lib/` — CRUD screens, pickers, editors, lesson session UI.
- Dashboard widget: `components/learned-today.tsx`.
- Assistant state: `assistant/conversation-reducer.ts`, `conversation-store.ts`, `conversation-actions.ts`, `conversation-selectors.ts`, related atoms.
- Assistant orchestration: `use-run-orchestration.ts`, `use-conversation-runs.ts`, `use-assistant-session.ts`, `build-stream-request.ts`.
- Assistant persistence: `conversation-persistence.ts`, `use-conversation-persistence.ts`.
- Assistant UI: `assistant-chat.tsx`, message renderers, conversations list, generated-cards table, prompt/settings, revert wiring.
- Profile cascade: `use-assistant-profile-selection.ts`, `use-global-ai-profile-state.ts`, `use-assistant-runtime-config.ts` — chat-tree subscription rules live here, not in `ai-react`.

### Does NOT own (prevent scope creep)

- Provider HTTP / client factory — `@koloda/ai`
- Generic streaming transport hooks and presentational chat chrome — `@koloda/ai-react`
- App routing, global settings pages, global hotkeys — `@koloda/app-react`
- Drizzle schema / Rust repos — `@koloda/srs-pgsql`, `koloda-core`
- Layout primitives — `@koloda/ui`

## Read next

- `agents/ASSISTANT-CHAT-MAP.md` — task routing and layer boundaries
- `docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md`
- `docs/specs/ASSISTANT-CHAT-MESSAGES.md`
- `docs/specs/ASSISTANT-CHAT-CARD-GENERATION.md`
- `agents/I18N.md` — strings in feature UI
