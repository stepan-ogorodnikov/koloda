# @koloda/srs-react

SRS feature React UI: decks, cards, lessons, templates, algorithms, and the assistant chat React layer (conversation store, session/`RunController`, persistence host, UI).

## Where it sits

Consumed by `@koloda/app-react` route files.
Depends on `@koloda/app`, `@koloda/srs`, `@koloda/ai`, `@koloda/ai-react`, `@koloda/assistant`, `@koloda/core-react`, and `@koloda/ui`.
Provider HTTP and generic stream hooks stay in `@koloda/ai` / `@koloda/ai-react`; run execution lifetime lives in `@koloda/assistant`; this package owns conversation policy, React hosts, and SRS screens.

**Ownership source of truth for assistant chat:** `agents/ASSISTANT-CHAT-MAP.md` — prefer that map over this README when routing assistant edits.

## Architectural Map

- Algorithms / templates / decks / cards / lessons: folders under `src/lib/` — CRUD screens, pickers, editors, lesson session UI.
- Dashboard widget: `components/learned-today.tsx`.
- Assistant layout under `assistant/`: `state/` (reducer, store, actions, selectors, messages), `runs/` (engine host adapter, session/`RunController`, orchestration, `build-stream-request`), `persistence/` (restore, save write adapter, coerce/normalize), `ui/` (chat shell, lists, settings, renderers).
- Profile cascade (assistant root): `use-assistant-profile-selection.ts`, `use-global-ai-profile-state.ts`, `use-assistant-runtime-config.ts` — chat-tree subscription rules live here, not in `ai-react`.

### Does NOT own (prevent scope creep)

- Framework-free run orchestration, persistence scheduling, AbortController lifetime, graceful shutdown — `@koloda/assistant` (wired via `useAssistantEngineHost`)
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
