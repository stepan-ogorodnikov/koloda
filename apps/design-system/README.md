# @koloda/design-system

Local catalog of the `@koloda/ui` design system, rendered in any registered color theme.
Role: dev tool, never shipped or deployed (see `docs/decisions/APP-ROLES.md`).

## Where it sits

A composition root like the other apps, with no database and no product screens.
It renders `@koloda/ui` and some feature components on stub `Queries`, with theme registries from `@koloda/app`.
Nothing in `apps/web`, `apps/electron`, or `apps/electron-react` imports it.

## How to run

- `nx run @koloda/design-system:serve` — dev server at `localhost:3100`
- Pages: `/` is the dashboard, `/decks` a deck with its cards, `/algorithms` and `/templates` the editors,
  and `/ai` the assistant.
  The Settings link has no page yet.
- The titlebar select picks the theme from `LIGHT_THEMES` and `DARK_THEMES` in `@koloda/app`.
  The choice is kept in local storage; a missing or unknown id falls back to the default light theme.

## Architectural Map

- Entry: `src/main.tsx` — activates English, applies the theme to `<html>`, and mounts the providers.
- Providers: `src/app/providers.tsx` — jotai, TanStack Query, Lingui and React Aria i18n, and the router.
- Router: `src/app/router.tsx` — code-based TanStack routes over browser history, one per page.
- Data: `src/app/queries.ts` — a stub `Queries`.
  Settings resolve to `null`, so hotkeys use their defaults.
  Lessons and today's review totals are sample data; lessons are shaped like `getLessons` in `@koloda/db-sqlite`.
  Conversations and the AI profile come from `src/app/assistant-samples.ts`.
  Conversation saves succeed without storing anything.
  The algorithm and the template come from `src/app/algorithm-samples.ts` and `src/app/template-samples.ts`.
  The deck, its cards, and their reviews come from `src/app/deck-samples.ts`, with one card in each state.
  Saving the algorithm, the template, the deck, or a card replaces it in memory until a reload.
  Every other query or mutation fails with its name when it runs.
- Assistant samples: `src/app/assistant-samples.ts` — a plain chat, a card proposal with tool calls,
  and one corrupt row, in the stored shape that assistant restore validates.
- AI runtime: `src/app/ai-runtime.ts` — lists sample models; sending a prompt fails the run.
- Theme: `src/app/theme.ts` — reads the stored theme at startup, stores it on change,
  and sets `<html>` the way `libs/app-react/public/theme-boot.js` does.
- Strings: `src/app/i18n.ts` — imports the English catalogs of the libs on screen as `.po` files.
- Shell: `src/components/shell.tsx` — the product layout and the assistant engine and save hosts.
  Nav links without a page render as in the product but do not navigate.
- Dashboard: `src/pages/dashboard-page.tsx` — `LearnedToday` in the sidebar and `Lessons` in the content.
- Assistant: `src/pages/assistant-page.tsx` — the AI route's conversation list and the real `AssistantChat`.
- Decks: `src/pages/decks-page.tsx` and `deck-page.tsx` — the deck list and the real cards and details tabs.
- Algorithms: `src/pages/algorithms-page.tsx` and `algorithm-page.tsx` — the algorithm list and the real editor.
- Templates: `src/pages/templates-page.tsx` and `template-page.tsx` — the template list and the real editor.
- Lesson modal: `src/components/lesson-modal.tsx` — replaces the real lesson modal in `Lessons`.
  A table count opens it; it shows the progress header with every dot type and icon.
  Its grades footer copies the srs-react markup, which is not exported, with sample intervals.
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
