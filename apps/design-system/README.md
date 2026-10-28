# @koloda/design-system

Local catalog of the `@koloda/ui` design system, rendered in any registered color theme.
Role: dev tool, never shipped or deployed (see `docs/decisions/APP-ROLES.md`).

## Where it sits

A composition root like the other apps, with no database and no product screens.
It renders `@koloda/ui` and some feature components on stub `Queries`, with theme registries from `@koloda/app`.
Nothing in `apps/web`, `apps/electron`, or `apps/electron-react` imports it.

## How to run

- `nx run @koloda/design-system:serve` — dev server at `localhost:3100`
- `?theme=<id>` picks the theme; the id is a key of `LIGHT_THEMES` or `DARK_THEMES` in `@koloda/app`.
  A missing or unknown id falls back to the default light theme.

## Architectural Map

- Entry: `src/main.tsx` — activates English, applies the theme to `<html>`, and mounts the providers.
- Providers: `src/app/providers.tsx` — jotai, TanStack Query, Lingui and React Aria i18n,
  and a one-route TanStack router over hash history.
- Data: `src/app/queries.ts` — a stub `Queries`.
  Settings resolve to `null`, so hotkeys use their defaults.
  Lessons and today's review totals are sample data; lessons are shaped like `getLessons` in `@koloda/db-sqlite`.
  Every other query or mutation fails with its name when it runs.
- Theme: `src/app/theme.ts` — reads `?theme=`, writes it back on change,
  and sets `<html>` the way `libs/app-react/public/theme-boot.js` does.
- Strings: `src/app/i18n.ts` — imports the English catalogs of the libs on screen as `.po` files.
- Shell: `src/components/shell.tsx` — the product layout, laid out like the dashboard:
  `LearnedToday` in the sidebar and `Lessons` in the content.
- Lesson modal: `src/components/lesson-modal.tsx` — replaces the real lesson modal in `Lessons`.
  A table count opens it; it shows the progress header with every dot type and icon.
  Its grades footer copies the srs-react markup, which is not exported, with sample intervals.
  Nav links render as in the product but do not navigate.
- Titlebar: `src/components/titlebar.tsx` — the `@koloda/ui` titlebar plus the theme select.

### Does NOT own (prevent scope creep)

- Components, tokens, and theme CSS — `@koloda/ui`; fix what the app reveals there
- Theme registries — `@koloda/app`
- Feature components — their feature libs; the app only shows them on stub data
- Product screens and routes — `@koloda/app-react`
- Translations — its own labels are plain English strings

## Read next

- `agents/ADD-COLOR-THEME.md` — theme CSS workflow
- `agents/CSS.md` — tokens and class conventions
- `agents/LAYOUT.md` — narrow and wide layout zones
