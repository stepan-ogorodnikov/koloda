# @koloda/assistant-react

Assistant chat React layer: conversation store, session/`RunController`, persistence host, and chat UI.

## Where it sits

Consumed by `@koloda/app-react` and `apps/native-electron-react` (graceful shutdown).
Depends on `@koloda/app`, `@koloda/srs`, `@koloda/ai`, `@koloda/ai-react`, `@koloda/assistant`, `@koloda/core-react`, and `@koloda/ui`.
Provider HTTP and generic stream hooks stay in `@koloda/ai` / `@koloda/ai-react`; run execution lifetime lives in `@koloda/assistant`; this package owns conversation policy and React hosts.

**Ownership source of truth for assistant chat:** `agents/ASSISTANT-MAP.md` — prefer that map over this README when routing assistant edits.

## Architectural Map

- Assistant layout under `assistant/`: `state/` (reducer, store, actions, selectors, messages), `runs/` (engine host adapter, session/`RunController`, orchestration, `build-stream-request`), `persistence/` (restore, save write adapter, coerce/normalize), `ui/` (chat shell, lists, settings, renderers).
- Profile cascade (assistant root): `use-assistant-profile-selection.ts`, `use-global-ai-profile-state.ts`, `use-assistant-runtime-config.ts` — chat-tree subscription rules live here, not in `ai-react`.

### Does NOT own (prevent scope creep)

- Framework-free run orchestration, persistence scheduling, AbortController lifetime, graceful shutdown — `@koloda/assistant` (wired via `useAssistantEngineHost`)
- Provider HTTP / client factory — `@koloda/ai`
- Generic streaming transport hooks and presentational chat chrome — `@koloda/ai-react`
- App routing, global hotkeys, application-shell assistant host mount — `@koloda/app-react`
- Global settings screens — `@koloda/settings-react`
- SRS screens — `@koloda/srs-react`
- Drizzle schema / Rust repos — `@koloda/db-pglite`, `koloda`
- Layout primitives — `@koloda/ui`

## Read next

- `agents/ASSISTANT-MAP.md` — task routing and layer boundaries
- `docs/specs/ASSISTANT-CONVERSATIONS.md`
- `docs/specs/ASSISTANT-MESSAGES.md`
- `docs/specs/ASSISTANT-CARD-GENERATION.md`
- `agents/I18N.md` — strings in feature UI
