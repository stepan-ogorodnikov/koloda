# @koloda/srs-react

SRS feature React UI: decks, cards, lessons, templates, and algorithms.

## Where it sits

Consumed by `@koloda/app-react` route files.
Depends on `@koloda/app`, `@koloda/srs`, `@koloda/core-react`, and `@koloda/ui`.

## Architectural Map

- Algorithms / templates / decks / cards / lessons: folders under `src/lib/` — CRUD screens, pickers, editors, lesson session UI.
- Dashboard widget: `components/learned-today.tsx`.

### Does NOT own (prevent scope creep)

- Assistant conversation store, run orchestration, chat UI — `@koloda/assistant-react`
- Framework-free run execution lifetime — `@koloda/assistant`
- Provider HTTP / client factory — `@koloda/ai`
- Generic streaming transport hooks and presentational chat chrome — `@koloda/ai-react`
- App routing, global settings pages, global hotkeys — `@koloda/app-react`
- Drizzle schema / Rust repos — `@koloda/db-pglite`, `koloda-core`
- Layout primitives — `@koloda/ui`

## Read next

- `agents/I18N.md` — strings in feature UI
