# @koloda/web

Browser host of the app: the full UI running on in-browser PostgreSQL (PGlite) with no server.
Data, settings, and AI profiles all live in the browser profile through IndexedDB.

## Where it sits

Assembles the `@koloda/app-react` screens on a PGlite-backed data layer.
It is the deployable web build; `apps/web-e2e` drives it with Playwright.
Persistence mirrors the desktop's SQLite core through the shared `@koloda/srs` domain (ADR 0002).

## How to run

- `nx run @koloda/web:serve` — dev server at `localhost:3000`
- `nx run @koloda/web:build` — production build to `dist/apps/web`; `VITE_BASE` sets the base path
- `nx run @koloda/web:preview` — serve the production build
- `nx run @koloda/web:test-unit` — unit tests
- `nx run @koloda/web:test` — Playwright e2e (config lives in `apps/web-e2e`)
- `nx run @koloda/web:lingui-extract` / `@koloda/web:lingui-compile` — locale catalogs

## Architectural Map

- Entry: `src/main.tsx` — mounts `AppProviders` from `@koloda/app-react` with the store and i18n.
- Store wiring: `src/app/store.ts` — jotai store, UI preferences, locale detection (stored lang, then navigator), web AI runtime.
- Database: `src/app/db.ts` — PGlite at `idb://koloda` with the drizzle schema and migration files.
- Queries: `src/app/queries.ts` — the `Queries` contract implemented in-process via `@koloda/db-pglite`.
- Setup: `src/app/setup.ts` — status check, migrations, and the one-transaction first setup with seed content.
- Seed content: `src/app/seed/<locale>/` — starter algorithms, templates, and decks per language.
- AI: `src/app/ai.ts` — profiles persisted in the ai settings slice, secrets redacted on read.
- AI runtime: `src/app/ai-runtime.ts` — browser AI runtime with an in-process tool executor over the same database.
- Browser support: `src/app/browser-support.ts` — IndexedDB and WASM required; Chromium-based recommended.
- Chrome: `src/components/` — app entry with the blank-database setup gate, first-setup overlay, titlebar.

### Does NOT own (prevent scope creep)

- Screens, routes — `@koloda/app-react`; settings screens and setup pickers — `@koloda/settings-react`
- Domain and scheduling — `@koloda/srs`; persistence schema — `@koloda/db-pglite`
- The desktop Electron host — `apps/electron` and `apps/electron-react`
- E2E harness — `apps/web-e2e`

## Read next

- `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md` — why two DB engines exist
- `docs/specs/` — behavior specs
- `agents/I18N.md` — locale workflow
