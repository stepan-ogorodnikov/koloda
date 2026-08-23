# native-electron-e2e

Playwright suite for the desktop app: launches the real Electron shell with the real Rust core and a fresh database per test.
One spec file per user flow; no app code is mocked except the AI provider.

## Where it sits

Tests `apps/native-electron` (main process) and `apps/native-electron-react` (renderer) together.
The `e2e` target builds the Rust addon and compiles the preload first, then serves the renderer dev server on port 3000
and launches Electron from `apps/native-electron` — the full stack, no bundling shortcuts.
The web counterpart is `apps/demo-e2e`; the spec sets mirror each other flow for flow.

## How to run

- `nx run native-electron-e2e:e2e` — full suite (builds the Rust addon and preload, serves the renderer, launches Electron)
- `nx run native-electron-e2e:typecheck` — typecheck only
- Also part of `nx run native-electron:test`

## Architectural Map

- Config: `playwright.config.ts` — single worker, serial specs, `en-US` / light scheme, failure-only artifacts.
- Fixtures: `src/fixtures.ts` — `_electron.launch` per test with a throwaway `KOLODA_USER_DATA` temp dir (isolated SQLite),
  `KOLODA_E2E=1`, and the first window as `page`.
- Helpers: `src/helpers.ts` — seeded `localStorage` defaults (English, light, motion off), the first-setup drive,
  and the shared CRUD, lesson, hotkey, AI profile, and assistant flows every spec composes.
- AI mock: `src/mock-openai-compatible.ts` — a real Node HTTP server, not `page.route` interception.
  AI HTTP runs in the Electron main process, invisible to renderer route interception;
  the handle returns the `baseUrl` to enter as the LM Studio profile.
  Serves SSE streams, tool calls, held responses, and failures from a FIFO queue per test.
- Specs: `src/*.spec.ts` — smoke, settings, decks, cards, templates, presets, lessons, hotkeys,
  AI profiles, and assistant chat.

### Does NOT own (prevent scope creep)

- Main-process build, preload, and bundling — `apps/native-electron` targets
- The renderer under test — `apps/native-electron-react`
- The web suite — `apps/demo-e2e`

## Read next

- `apps/native-electron/README.md` — the Electron host
- `apps/demo-e2e/README.md` — the mirrored web suite
