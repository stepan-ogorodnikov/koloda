# @koloda/settings-react

Global settings screens: interface, learning, hotkeys, AI profiles, and the setup pickers that edit those rows.

## Where it sits

Consumed by `@koloda/app-react` routes and by `apps/demo` / `apps/native-electron-react` setup screens.
Depends on `@koloda/settings`, `@koloda/app`, `@koloda/ai`, `@koloda/ai-react`, `@koloda/core-react`, `@koloda/srs-react`, and `@koloda/ui`.
The Zod registry stays in `@koloda/settings`; this package owns the forms that edit those rows.

## Architectural Map

- Interface: `settings-interface.tsx`, `interface-controls/` — language, scheme, theme, and motion controls.
- Learning: `settings-learning.tsx` — defaults, limits, and day-boundary form.
- Hotkeys: `settings-hotkeys.tsx`, `settings-hotkeys-hotkey.tsx` — scoped hotkey editor.
- AI profiles: `settings-ai.tsx` plus add/edit/delete/models dialogs; `ai-providers/` per-provider forms; `ai-profile-models-allowlist.ts`.

### Does NOT own (prevent scope creep)

- Zod registry / DTOs — `@koloda/settings`
- Domain schemas — `@koloda/app`, `@koloda/ai`
- Persistence — `@koloda/db-pglite`, `koloda`
- Routes, `useGlobalSync`, `wireUiPreferences`, global hotkey wiring — `@koloda/app-react`
- Conversation-level assistant settings (prompt/temperature) — `@koloda/assistant-react`
- Layout primitives — `@koloda/ui`

## Read next

- `agents/ADD-AI-PROVIDER.md` — provider form files in this package
- `agents/ADD-HOTKEY.md` — hotkey schema changes (TS + Rust)
- `agents/ADD-COLOR-THEME.md` — theme CSS; pickers live here, `theme-boot.js` stays in app-react
- `docs/specs/INTERFACE-SETTINGS.md`
- `docs/specs/LEARNING-SETTINGS.md`
- `docs/specs/HOTKEYS.md`
- `agents/I18N.md` — strings in feature UI
