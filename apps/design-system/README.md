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
  `/ai` the assistant, and `/settings` with its `/settings/interface`, `/settings/learning`, and
  `/settings/hotkeys` pages.
- The titlebar select lists `LIGHT_THEMES` and `DARK_THEMES` in `@koloda/app`.
  Picking a theme also makes its side the scheme, so the app shows the theme that was picked.
- Scheme, themes, motion, and language work as in the product: the settings screen and the titlebar select change the
  same atoms, and they are kept in local storage (`koloda-ui-prefs`, and `lang` for the language) between visits.

## Architectural Map

- Entry: `src/main.tsx` — mounts the providers.
- Store: `src/app/store.ts` — calls `wireUiPreferences` from `@koloda/settings-react`, as the web app does.
  It applies the scheme, both themes, and motion to `<html>` and keeps them in local storage.
  `libs/app-react/public/theme-boot.js` (served by the `theme-boot` Vite plugin) applies them before CSS loads.
  It also keeps the language in `localStorage` (`lang`) and activates it on change, as the web app does.
- Providers: `src/app/providers.tsx` — jotai, TanStack Query, Lingui and React Aria i18n, and the router.
- Router: `src/app/router.tsx` — code-based TanStack routes over browser history, one per page.
- Data: `src/app/queries.ts` — a stub `Queries`.
  Settings start `null`, so hotkeys use their defaults, except learning, whose defaults are the sample algorithm and
  template; saving a settings row keeps it in memory.
  Lessons and today's review totals are sample data; lessons are shaped like `getLessons` in `@koloda/db-sqlite`.
  Conversations and the AI profile come from `src/app/assistant-samples.ts`.
  Conversation saves succeed without storing anything.
  The algorithm and the template come from `src/app/algorithm-samples.ts` and `src/app/template-samples.ts`.
  The deck, its cards, and their reviews come from `src/app/deck-samples.ts`, with one card in each state.
  Saving the algorithm, the template, the deck, or a card replaces it in memory until a reload.
  Every other query or mutation fails with its name when it runs.
- Assistant samples: `src/app/assistant-samples.ts` — a plain chat, a card proposal with tool calls,
  an in-progress run with a running tool call and a Thinking row, and one corrupt row, in the stored shape that
  assistant restore validates.
  `store.ts` seeds the in-progress run into the live store, since restore would close its running rows.
- AI runtime: `src/app/ai-runtime.ts` — lists sample models; sending a prompt fails the run.
- Theme: `src/app/theme.ts` — `activeThemeAtom`, the theme in effect: the scheme picks the side, and System follows
  the device live.
- Strings: `src/app/i18n.ts` — imports the English and Russian catalogs of the libs on screen, and of
  `@koloda/app-react`, as `.po` files. The nav, page titles, and settings labels use its ids.
- Shell: `src/components/shell.tsx` — the product layout and the assistant engine and save hosts.
  Nav links without a page render as in the product but do not navigate.
- Dashboard: `src/pages/dashboard-page.tsx` — `LearnedToday` in the sidebar and `Lessons` in the content.
- Assistant: `src/pages/assistant-page.tsx` — the AI route's conversation list and the real `AssistantChat`.
- Decks: `src/pages/decks-page.tsx` and `deck-page.tsx` — the deck list and the real cards and details tabs.
- Algorithms: `src/pages/algorithms-page.tsx` and `algorithm-page.tsx` — the algorithm list and the real editor.
- Templates: `src/pages/templates-page.tsx` and `template-page.tsx` — the template list and the real editor.
- Settings: `src/pages/settings-page.tsx` — the settings sidebar and outlet;
  `settings-interface-page.tsx`, `settings-learning-page.tsx`, and `settings-hotkeys-page.tsx` — the real
  `SettingsInterface`, `SettingsLearning`, and `SettingsHotkeys`.
  The scheme, light and dark theme, motion, and language rows work as in the product.
  The strings of the libs translate, and so do the nav, page titles, and settings labels. The titlebar theme select
  and the lesson dialog's aria label stay English.
- Lesson modal: `src/components/lesson-modal.tsx` — replaces the real lesson modal in `Lessons`.
  A table count opens it; it shows the progress header with every dot type and icon.
  Its grades footer copies the srs-react markup, which is not exported, with sample intervals.
- Titlebar: `src/components/titlebar.tsx` — the `@koloda/ui` titlebar plus the theme select.

### Does NOT own (prevent scope creep)

- Components, tokens, and theme CSS — `@koloda/ui`; fix what the app reveals there
- Theme registries — `@koloda/app`
- Feature components — their feature libs; the app only shows them on stub data
- Product screens and routes — `@koloda/app-react`
- Translations of its own labels — the titlebar theme select and the lesson dialog's aria label stay English

## Read next

- `agents/ADD-COLOR-THEME.md` — theme CSS workflow
- `agents/CSS.md` — tokens and class conventions
- `agents/LAYOUT.md` — narrow and wide layout zones
