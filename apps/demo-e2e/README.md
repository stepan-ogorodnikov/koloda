# demo-e2e

Playwright suite for the browser demo: drives the real UI end to end against the PGlite database in Chromium.
One spec file per user flow; no app code is mocked except the AI provider.

## Where it sits

Tests `apps/demo` exclusively; the suite boots the demo dev server itself on `127.0.0.1:4300`.
The desktop counterpart is `apps/native-electron-e2e` — the two spec sets mirror each other flow for flow.
Unit tests live in the app projects (`demo:test-unit`), not here.

## How to run

- `nx run demo-e2e:e2e` — full suite (boots the demo dev server on port 4300; reuses a running one outside CI)
- `nx run demo-e2e:typecheck` — typecheck only
- Also reachable as `nx run demo:test` and via the root `check:demo-all` script

## Architectural Map

- Config: `playwright.config.ts` — single worker, serial specs, `en-US` / light scheme, failure-only artifacts.
- Helpers: `src/helpers.ts` — seeded `localStorage` defaults (English, light, motion off), the first-setup drive,
  and the shared CRUD, lesson, hotkey, AI profile, and assistant flows every spec composes.
- AI mock: `src/mock-openai-compatible.ts` — intercepts `/v1/models` and `/v1/chat/completions` with `page.route`.
  Same-origin base URL (`http://127.0.0.1:4300/v1`) so browser fetch never hits CORS.
  Serves SSE streams, tool calls, held responses, and failures from a FIFO queue per test.
- Specs: `src/demo-*.spec.ts` — smoke, settings, decks, cards, templates, presets, lessons, hotkeys,
  AI profiles, and assistant chat.

### Does NOT own (prevent scope creep)

- The app under test — `apps/demo`
- Unit tests — `demo:test-unit` in the app project
- The desktop suite — `apps/native-electron-e2e`

## Read next

- `apps/demo/README.md` — the app under test
- `apps/native-electron-e2e/README.md` — the mirrored desktop suite
