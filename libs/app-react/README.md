# @koloda/app-react

Application shell: TanStack Router tree, primary nav layout, global sync, and global hotkey wiring.
Composes feature screens from `@koloda/srs-react`, `@koloda/assistant-react`, and `@koloda/settings-react`; does not own SRS domain, assistant conversation state, or settings forms.

## Where it sits

Consumed by `apps/web` and `apps/electron-react` (import `routeTree`).
Depends on `@koloda/app`, `@koloda/settings`, `@koloda/srs-react`, `@koloda/assistant-react`, `@koloda/settings-react`, `@koloda/core-react`, and `@koloda/ui`.
Each app must set `appEntryAtom` before routes render and inject its `Queries` implementation.

## Architectural Map

- Shell: `components/app.tsx` — primary/secondary nav; mounts `useGlobalSync` and `useAppHotkeys`.
- Providers: `app-providers.tsx` — root provider composition (Jotai, TanStack Query, Lingui, router) and i18n activation.
- Routes: `routes/` — file-based TanStack routes (dashboard, decks, algorithms, templates, AI, settings); `routeTree.gen.ts` is generated.
- Global sync: `hooks/use-global-sync.ts` — settings → Jotai atoms (theme, motion, defaults, lang).
- UI preferences: `wire-ui-preferences.ts` — wires scheme/theme/motion into atoms and the document; `ui-preferences-cache.ts` — persists them to `localStorage`.
- Global hotkeys: `hooks/use-app-hotkeys.ts` — navigation/ui scopes only; feature scopes live in feature components.
- Locales: `locales/` — Lingui `.po` catalogs for the shell.

### Does NOT own (prevent scope creep)

- SRS domain logic — `@koloda/srs`
- Assistant conversation store / run orchestration — `@koloda/assistant-react`
- Global settings screens / setup pickers — `@koloda/settings-react`
- DB repos or schema — `@koloda/db-sqlite`, `koloda`
- Provider HTTP — `@koloda/ai`
- Layout primitives — `@koloda/ui`

## Read next

- `agents/LAYOUT.md` — route layout patterns
- `agents/I18N.md` — extract/compile workflow
- `agents/ADD-HOTKEY.md` — global vs feature-scoped hotkeys
- `agents/ADD-AI-PROVIDER.md` — provider form files in settings-react
- `agents/ADD-COLOR-THEME.md`
