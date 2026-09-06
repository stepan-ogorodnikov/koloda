# Electron IPC Surface

The channel contract between the desktop renderer (`apps/native-electron-react`) and this main process.
Update this file in the same change as any handler.

All renderer-to-main calls go through one generic `window.electronAPI.invoke(cmd, args)` from the preload.
Main-to-renderer pushes arrive on `window.electronAPI.on(channel, callback)` subscriptions.

## Conventions

- Errors cross as thrown `Error` messages containing JSON `{ code, details }` (AppError / AIError codes).
  The renderer bridge re-parses them into `AppError` / `AIError`.
- Values crossing the Rust boundary follow the NAPI wire format (`toWire`/`fromWire` in the renderer):
  `Date` as epoch ms, `BigInt` bounds-checked to safe integers.
- Data-command args mirror the `KolodaDb` NAPI method signatures — `{ params }` for reads, `{ data }` for writes,
  or the plain object where the method takes one.
- Channel names and arg/result shapes are machine-checked against the `DataIpc` contract in `libs/native-ipc`
  (`@koloda/native-ipc`), which both processes compile against.

## Data Commands

Each handler maps 1:1 to a `KolodaDb` NAPI method backed by `crates/koloda-core` repos over SQLite.
The full method list lives in `src-rust/src/lib.rs`.

- Lifecycle: `get_db_status`, `seed_db`
- Cards: `cmd_get_cards`, `cmd_get_card`, `cmd_add_card`, `cmd_add_cards`, `cmd_update_card`,
  `cmd_delete_card`, `cmd_delete_cards`, `cmd_reset_card_progress`
- Presets (algorithms): `cmd_get_algorithms`, `cmd_get_algorithm`, `cmd_get_algorithm_decks`,
  `cmd_add_algorithm`, `cmd_clone_algorithm`, `cmd_update_algorithm`, `cmd_delete_algorithm`
- Decks: `cmd_get_decks`, `cmd_get_deck`, `cmd_add_deck`, `cmd_update_deck`, `cmd_delete_deck`
- Templates: `cmd_get_templates`, `cmd_get_template`, `cmd_get_template_decks`,
  `cmd_add_template`, `cmd_clone_template`, `cmd_update_template`, `cmd_delete_template`
- Settings: `cmd_get_settings`, `cmd_set_settings`, `cmd_patch_settings`
- Conversations: `cmd_get_conversation`, `cmd_get_conversations`, `cmd_set_conversation`, `cmd_delete_conversation`
- Lessons and reviews: `cmd_get_lessons`, `cmd_get_lesson_data`, `cmd_submit_lesson_result`,
  `cmd_get_reviews`, `cmd_get_review_totals`, `cmd_get_todays_review_totals`
- AI profiles: `cmd_get_ai_profiles`, `cmd_add_ai_profile`, `cmd_update_ai_profile`, `cmd_remove_ai_profile`

There is deliberately no command for reading AI profile secrets.
Secrets load main-side only; see the AI streaming section.

## AI Streaming (`src/ai-ipc.ts`)

- `cmd_ai_list_models` `{ profileId }` — model list; secrets load in main, never cross IPC.
- `cmd_ai_chat_stream` `{ requestId, profileId, request }` — returns immediately; the run streams events
  on the `ai:stream` channel, all keyed by `requestId`:
  - `chunk` — assistant text delta
  - `toolCall` — the model invoked an assistant tool
  - `toolResult` — tool output or error text (raw errors do not survive structured clone)
  - `done` — final usage
  - `error` — `{ code, message }`; `AbortError` maps to code `aborted`, provider errors win over a racing abort
- `cmd_ai_abort` `{ requestId }` — aborts only that run (one `AbortController` per `requestId`).

Functions do not cross IPC: the renderer strips them, and main recreates the assistant tool executor
over `KolodaDb`, streaming tool events back on the same channel.

## Window and Lifecycle

- `window:minimize`, `window:maximize` (toggles), `window:close`, `window:isMaximized`
- `window:set-title-bar-overlay` `{ color, symbolColor, height }` — non-macOS only; persists colors to `ui-prefs.json`
- `window:get-overlay-width` — platform- and DPI-scaled overlay width
- `window:set-window-button-position` `{ titlebarHeight }` — macOS traffic lights
- `window:maximize-changed` (main → renderer push on maximize/unmaximize)
- Close handshake (`src/window-close-coordinator.ts`):
  - main sends `app:shutdown-request`; the renderer interrupts and flushes, then answers `app:shutdown-ack`
  - bounded at 2500 ms — on timeout main saves window bounds and force-destroys
  - extra close clicks during the handshake stay deferred

## Preload Bridge (renderer-side, no main IPC)

`window.electronAPI` also exposes zoom controls implemented on `webFrame` in the preload:
`zoomIn` / `zoomOut` / `zoomReset` (0.5 steps, clamped to ±3), `getZoomLevel`, `setZoomLevel`,
`getZoomFactor`, and `onZoomFactorChanged`.
