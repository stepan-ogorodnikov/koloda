# @koloda/ui

Design system and layout shell: Tailwind/RAC primitives, responsive layout zones, color themes, hotkey widgets, and async query-state components.
Presentational only — no business logic, routing, or data fetching.

## Where it sits

Consumed by `@koloda/app-react`, `@koloda/srs-react`, and app entry components.
Depends lightly on `@koloda/app` for shared types.

## Architectural Map

- Styles: `styles/` — `global.css` (Tailwind `@theme`, `--breakpoint-wd`), light/dark scheme files, `themes/*.css` (palette/accent only), `base.css`, `utilities.css`.
- Layout: `layout/` — `layout.tsx` composition plus nav, sidebar, drawer, content, header, header-scroll.
- Form & overlay primitives: `primitives/form/`, `primitives/overlay/` — RAC-backed controls, dialogs, popovers, tooltips.
- Table & misc primitives: `primitives/table/`, tabs, select, search-field, link, dnd, animations.
- Core helpers: `core/focus.ts`, `core/hotkeys.ts` — focus and keyboard matching.
- App chrome widgets: `ui/` — titlebar, hotkey recorder, query loading/error, delete dialog, not-found.
- Hooks: `hooks/use-motion-settings`, `use-route-focus`, `use-scrolled-past`.

### Does NOT own (prevent scope creep)

- Routing or settings pages — `@koloda/app-react`
- SRS / AI feature UI — `@koloda/srs-react`, `@koloda/ai-react`
- Settings schema or theme picker behavior — `@koloda/app`, `@koloda/app-react`
- Data fetching — `@koloda/core-react` + app `Queries`

## Read next

- `agents/LAYOUT.md` — narrow/wide breakpoint behavior
- `agents/ADD-COLOR-THEME.md` — theme CSS workflow
- `agents/ADD-HOTKEY.md` — hotkey recorder UI
