# electron-e2e

Playwright suite for the desktop app:
launches the real Electron shell with the real Rust core and a fresh database per test.
One spec file per user flow; no app code is mocked except the AI provider.

## Where it sits

Tests `apps/electron` (main process) and `apps/electron-react` (renderer) together.
The `e2e` target builds the Rust addon and `koloda-server` and compiles the preload first, then serves the renderer
dev server on port 3000 and launches Electron from `apps/electron` — the full stack, no bundling shortcuts.
The addon is a debug build, so it can keep secrets in a file instead of the OS keyring (Fixtures below).
So no run of the suite uses the release addon or the OS keyring; a release build's keyring is checked by hand.
The web counterpart is `apps/web-e2e`; the spec sets mirror each other flow for flow.
Sync is the exception: the web demo does not sync, so its spec is desktop only.

## How to run

- `nx run electron-e2e:e2e` — full suite (builds the Rust addon, the sync server, and the preload, serves the renderer,
  launches Electron)
- One spec: run the first four commands of the `e2e` target in `project.json` (the builds and the preload), then
  `bunx playwright test --config apps/electron-e2e/playwright.config.ts sync.spec.ts`.
  An argument after `nx run electron-e2e:e2e --` reaches every build command too, so the filter goes to Playwright.
  Without the builds, the run uses whatever addon and server the last build left.
- `nx run electron-e2e:typecheck` — typecheck only
- Also part of `nx run @koloda/electron:test`

## Architectural Map

- Config: `playwright.config.ts` — single worker, serial specs, `en-US` / light scheme, failure-only artifacts.
- Fixtures: `src/fixtures.ts` — `_electron.launch` per test with a throwaway
  `KOLODA_USER_DATA` temp dir (isolated SQLite),
  `KOLODA_E2E=1`, and the first window as `page`.
  `KOLODA_E2E_SECRETS` names `secrets.json` in that dir, where AI keys and sync tokens go instead of the OS keyring.
  `launchApp(userDataDir)` starts another instance the same way, for a spec that needs a second device.
- Helpers: `src/helpers.ts` — re-exports the shared UI flows from `libs/e2e` (`@koloda/e2e`) and wraps this
  suite's platform points: defaults written into the already-loaded window followed by a reload, and the
  desktop bootstrap copy ("How do you want to start?") and its "Start fresh" button.
- AI mock: `src/mock-openai-compatible.ts` — a real Node HTTP server, not `page.route` interception,
  built on the shared protocol in `libs/e2e`.
  AI HTTP runs in the Electron main process, invisible to renderer route interception;
  the handle returns the `baseUrl` to enter as the LM Studio profile.
  Serves SSE streams, tool calls, held responses, and failures from a FIFO queue per test.
- Sync server: `src/sync-server.ts` — `startSyncServer()` runs the built `koloda-server` on a free loopback port
  over plain HTTP, with a throwaway data directory; the handle returns its `url`, `setupToken`, and `log`.
  The sync spec attaches the log to a test that fails.
- Specs: `src/*.spec.ts` — smoke, settings, decks, cards, templates, presets, lessons, hotkeys,
  AI profiles, assistant chat, and sync.

### Does NOT own (prevent scope creep)

- Main-process build, preload, and bundling — `apps/electron` targets
- The renderer under test — `apps/electron-react`
- The web suite — `apps/web-e2e`

## Read next

- `apps/electron/README.md` — the Electron host
- `apps/web-e2e/README.md` — the mirrored web suite
