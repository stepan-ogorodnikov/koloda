# web-e2e

Playwright suite for the browser host: drives the real UI end to end against in-browser SQLite in Chromium.
One spec file per user flow; no app code is mocked except the AI provider.

## Where it sits

Tests `apps/web` exclusively; the suite boots the web dev server itself on `127.0.0.1:4300`.
The desktop counterpart is `apps/electron-e2e` — the two spec sets mirror each other flow for flow.
Unit tests live in the app projects (`@koloda/web:test-unit`), not here.

## How to run

- `nx run web-e2e:e2e` — full suite (boots the web dev server on port 4300; reuses a running one outside CI)
- `nx run web-e2e:typecheck` — typecheck only
- Also reachable as `nx run @koloda/web:test` and via the root `check:web-all` script

## Architectural Map

- Config: `playwright.config.ts` — single worker, serial specs, `en-US` / light scheme, failure-only artifacts.
- Helpers: `src/helpers.ts` — re-exports the shared UI flows from `libs/e2e` (`@koloda/e2e`) and wraps this
  suite's platform points: defaults seeded via an init script before first load and the web bootstrap copy
  ("Setting up a demo"); slider helpers are web-only.
- AI mock: `src/mock-openai-compatible.ts` — `page.route` transport around the shared protocol in `libs/e2e`,
  intercepting `/v1/models` and `/v1/chat/completions`.
  Same-origin base URL (`http://127.0.0.1:4300/v1`) so browser fetch never hits CORS.
  Serves SSE streams, tool calls, held responses, and failures from a FIFO queue per test.
- Specs: `src/*.spec.ts` — smoke, settings, decks, cards, templates, presets, lessons, hotkeys,
  AI profiles, and assistant chat.

### Does NOT own (prevent scope creep)

- The app under test — `apps/web`
- Unit tests — `@koloda/web:test-unit` in the app project
- The desktop suite — `apps/electron-e2e`

## Read next

- `apps/web/README.md` — the app under test
- `apps/electron-e2e/README.md` — the mirrored desktop suite
