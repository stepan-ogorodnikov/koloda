# @koloda/app-react

Application shell: TanStack Router tree, primary nav layout, global settings pages, AI provider profile forms, and global hotkey wiring.
Composes feature screens from `@koloda/srs-react`; does not own SRS domain or assistant conversation state.

## Where it sits

Consumed by `apps/demo` and `apps/native-electron-react` (import `routeTree`).
Depends on `@koloda/app`, `@koloda/srs`, `@koloda/srs-react`, `@koloda/ai`, `@koloda/ai-react`, `@koloda/core-react`, and `@koloda/ui`.
Each app must set `appEntryAtom` before routes render and inject its `Queries` implementation.

## Architectural Map

- Shell: `components/app.tsx` — primary/secondary nav; mounts `useGlobalSync` and `useAppHotkeys`.
- Routes: `routes/` — file-based TanStack routes (dashboard, decks, algorithms, templates, AI, settings); `routeTree.gen.ts` is generated.
- Global sync: `hooks/use-global-sync.ts` — settings → Jotai atoms (theme, motion, defaults, lang).
- Global hotkeys: `hooks/use-app-hotkeys.ts` — navigation/ui scopes only; feature scopes live in feature components.
- Settings UI: `settings/` — interface, learning, hotkeys, AI profiles; `settings/ai-providers/` per-provider forms.
- Locales: `locales/` — Lingui `.po` catalogs for the shell.

### Does NOT own (prevent scope creep)

- SRS domain logic — `@koloda/srs`
- Assistant conversation store / run orchestration — `@koloda/srs-react/.../assistant`
- DB repos or schema — `@koloda/srs-pgsql`, `koloda-core`
- Provider HTTP — `@koloda/ai`
- Layout primitives — `@koloda/ui`

## Read next

- `agents/LAYOUT.md` — route layout patterns
- `agents/I18N.md` — extract/compile workflow
- `agents/ADD-HOTKEY.md` — global vs feature-scoped hotkeys
- `agents/ADD-AI-PROVIDER.md` — provider form files in settings
- `agents/ADD-COLOR-THEME.md`
