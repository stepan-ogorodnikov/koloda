# e2e

Shared Playwright support code for the two e2e suites, `apps/web-e2e` (web) and
`apps/native-electron-e2e` (desktop). The suites drive the same app UI, so the
page flows and the AI-mock wire format are defined once here; only the platform
differences live in the suites themselves.

Tagged `type:e2e`: only the e2e apps import it, nothing runtime depends on it,
and it must never gain runtime dependencies.

## Architectural Map

- UI flows: `src/ui-flows.ts` — the shared CRUD, lesson, hotkey, AI profile, and
  assistant flows every spec composes. The two deliberate parameter points:
  `applyPageDefaults(page, when)` (`before-load` init script vs `after-load`
  evaluate + reload) and `bootstrapApp(page, bootstrapText)` (the per-suite
  first-setup copy).
- AI mock protocol: `src/ai-mock.ts` — the `Mock*Options`/`Handle` contracts and
  the OpenAI-compatible SSE/JSON builders, transport-independent.
- Barrel: `src/index.ts` — the only public door.

## What stays per-suite (on purpose)

- `playwright.config.ts` and the launch layer: web boots a vite `webServer`;
  Electron launches the real shell via `_electron.launch` with an isolated
  `KOLODA_USER_DATA`.
- The AI-mock transport around `src/ai-mock.ts`: web uses `page.route` plus a
  page-side SSE re-streamer; Electron uses a real Node HTTP server because
  main-process AI fetch is invisible to route interception.
- The suites' `helpers.ts` facades re-export the shared flows and wrap the
  parameter points, so spec files import platform-local names.

## Read next

- `apps/web-e2e/README.md` and `apps/native-electron-e2e/README.md` — the consumers
