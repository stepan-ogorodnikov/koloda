# @koloda/core-react

Shared React infrastructure: the `Queries` contract, TanStack Query key factory, global Jotai atoms, and hotkey registration hooks.
No feature screens and no concrete DB backends.

## Where it sits

Consumed by `@koloda/app-react`, `@koloda/srs-react`, and apps that inject a concrete `queriesFn` into `queriesAtom`.
Depends on `@koloda/app`, `@koloda/srs`, and `@koloda/ai` for types only.
Demo implements `Queries` with `@koloda/srs-pgsql`; desktop implements it via Electron `invoke` → `koloda-core`.

## Architectural Map

- Query contract: `queries.ts` — `Queries` (settings, conversations, algorithms, templates, decks, cards, lessons, reviews, AI profiles).
- Query keys: `query-keys.ts` — centralized key builders.
- Atoms: `atoms.ts` — theme/lang/defaults, `aiProvidersAtom`, `appEntryAtom`, `queriesAtom`.
- Hotkeys: `hooks/use-app-hotkey.ts`, `use-hotkeys-settings.ts`, `use-hotkeys-status.ts` — scope-aware registration via TanStack Hotkeys.
- Misc: `hooks/use-title.ts`, `utility.ts` (`dispatchReducerAction`).

### Does NOT own (prevent scope creep)

- Concrete query implementations — each app's `queries.ts`
- UI primitives — `@koloda/ui`
- SRS / assistant feature UI — `@koloda/srs-react`
- DB repos or schema — `@koloda/srs-pgsql`, `koloda-core`

## Read next

- `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md` — why each app injects a different `Queries` backend
- `agents/ADD-HOTKEY.md` — `useAppHotkey` patterns
- `docs/specs/HOTKEYS.md` — hotkey behavior
- `agents/LAYOUT.md` — interface settings synced through atoms
