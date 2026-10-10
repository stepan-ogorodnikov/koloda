# Electron IPC Surface

The channel contract between the desktop renderer (`apps/electron-react`) and this main process.
Update this file in the same change as any handler.

All renderer-to-main calls go through one `window.electronAPI.invoke(cmd, args)` from the preload.
The renderer wraps it in a typed `invoke` (`apps/electron-react/src/app/electron.ts`) whose
channel keys, args, and results are enforced by the contract below; the preload keeps the same
signature via a type-only import (erased when swc compiles it standalone).
Main-to-renderer pushes arrive on `window.electronAPI.on(channel, callback)` subscriptions.

## Conventions

- Errors cross as thrown `Error` messages containing JSON `{ code, details }` (AppError / AIError codes).
  The renderer bridge re-parses them into `AppError` / `AIError`.
- Values crossing the Rust boundary follow the NAPI wire format (`toWire`/`fromWire` in the renderer):
  `Date` as epoch ms, `BigInt` bounds-checked to safe integers.
  Attachment bytes cross as base64 strings; `toWire` would walk a `Uint8Array` as a plain object.
- Data-command args mirror the `KolodaDb` NAPI method signatures — `{ params }` for reads, `{ data }` for writes,
  or the plain object where the method takes one.
- Channel names and arg/result shapes are machine-checked against the `DataIpc` contract in `libs/native-ipc`
  (`@koloda/native-ipc`), which both processes compile against. The contract covers every data, AI, and media
  command plus the `AI_STREAM_CHANNEL` (`ai:stream`) event payload (`AiStreamEvent`); window-channel args are typed
  at their `window-ipc.ts` handlers, outside the contract.

## Data Commands

Each handler maps 1:1 to a `KolodaDb` NAPI method backed by `crates/koloda` repos over SQLite.
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
  `cmd_get_reviews`, `cmd_get_todays_review_totals`
- Attachments: `cmd_get_attachment` (meta plus base64 bytes, or `null`), `cmd_add_attachment` (base64 bytes),
  `cmd_sweep_attachments`
- AI profiles: `cmd_get_ai_profiles`, `cmd_add_ai_profile`, `cmd_update_ai_profile`, `cmd_remove_ai_profile`

There is deliberately no command for reading AI profile secrets.
Secrets load main-side only; see the AI streaming section.

## AI Streaming (`src/ai-ipc.ts`)

The three commands and the `AiStreamEvent` union are part of the `DataIpc` contract in
`@koloda/native-ipc`; this section records the behavior around them.

- `cmd_ai_list_models` `{ profileId }` — model list; secrets load in main, never cross IPC.
- `cmd_ai_chat_stream` `{ requestId, profileId, request }` — returns immediately; the run streams events
  on the `ai:stream` channel (`AI_STREAM_CHANNEL` from the contract), all keyed by `requestId`:
  - `chunk` — assistant text delta
  - `toolCall` — the model invoked an assistant tool
  - `toolResult` — tool output or error text (raw errors do not survive structured clone)
  - `done` — final usage
  - `error` — `{ code, message }`; `AbortError` maps to code `aborted`, provider errors win over a racing abort
- `cmd_ai_abort` `{ requestId }` — aborts only that run (one `AbortController` per `requestId`).

Functions do not cross IPC: the renderer strips them, and main recreates the assistant tool executor
over `KolodaDb`, streaming tool events back on the same channel.

## Media (`src/media-ipc.ts`)

- `cmd_add_attachment_from_url` `{ url }` — fetches an image URL in main and stores it as an attachment.
  - Only `http:` and `https:` URLs, checked on every redirect hop; no app cookies or credentials.
  - Times out; aborts a body past the attachment size cap with `validation.attachments.too-large`.
  - Network failure, timeout, and a non-2xx status are `attachments.fetch`.
  - The bytes go through `KolodaDb.addAttachment`, so the repo sniffs, hashes, and dedupes them.

## Sync (`src/sync-ipc.ts`)

The `koloda-sync` engine runs inside the addon on the app's database (`src-rust/src/sync.rs`).
Its host calls wait on the network, so they run on a sync thread of their own, never on the database thread.
Every product write command tells the engine a local commit happened; conversations, AI profiles, and attachment
writes capture nothing and do not.

- `cmd_sync_start` `{ starter }` — starts the engine on the first call and returns the status.
  - `starter` is the algorithm and template sync repair creates when none is left.
    The first-run seed builds the same content.
  - The background runner starts once the database is in a space; a database in no space runs nothing.
  - A later call, as after a renderer reload, only returns the status.
- `cmd_sync_status` — the current `SyncStatus` (`@koloda/app`).
- `cmd_sync_nudge` — asks the runner to sync now; main also nudges when the system resumes.
- `cmd_sync_create_space` `{ data: { serverUrl, setupToken, spaceName, deviceName } }` — creates a space on the
  server, enrolls this database as its first device, starts the runner, and returns the status.
  The setup token is sent once and not kept.
- `cmd_sync_issue_pairing` — a pairing code for another device, the server URL, and `expiresAt` in this device's
  clock (the server's expiry minus the engine's skew estimate).
- `cmd_sync_devices` — the space's devices: `id`, `name`, `platform`, `lastSeenAt` (server time), `isRevoked`,
  and `isSelf`.
- `cmd_sync_revoke_device` `{ id }` — revokes another device of the space.
- `cmd_sync_detach` — revokes this device and detaches the database; rows stay. Returns the status.
- `cmd_sync_device_name` — the OS host name, which main reads; the default name of this device.
- Engine events stream on `SYNC_EVENT_CHANNEL` (`sync:event`) to every window as a `SyncEvent`:
  - `changed` `{ kinds }` — rows of these kinds changed; the renderer refreshes the queries each kind feeds;
  - `status` `{ status }` — the status after each change of state;
  - `attachmentsFetched` `{ ids }` — these images arrived.
- An engine `error` event goes to main's log only; the status already says why sync stopped.
- Failures cross as `{ code, details }` with a `sync.*` code (`sync_error_codes` in `src-rust/src/sync.rs`), or the
  `koloda` code of a local failure.

## Window and Lifecycle

Channel names below are exported as `WINDOW_*_CHANNEL` constants from `@koloda/native-ipc` — both
processes import them instead of repeating the literals.

- `window:maximize` (toggle) — the only window-control channel the renderer invokes; native overlay buttons and traffic lights handle minimize and close
- `window:set-title-bar-overlay` `{ color, symbolColor, height }` — non-macOS only; persists colors to `ui-prefs.json`
- `window:set-window-button-position` `{ titlebarHeight }` — macOS traffic lights
- Close handshake (`src/window-close-coordinator.ts`; channel names in `@koloda/native-ipc`):
  - main sends `app:shutdown-request`; the renderer interrupts and flushes, then answers `app:shutdown-ack`
  - bounded at 2500 ms — on timeout main saves window bounds and force-destroys
  - extra close clicks during the handshake stay deferred

## Preload Bridge (renderer-side, no main IPC)

`window.electronAPI` also exposes zoom controls implemented on `webFrame` in the preload:
`zoomIn` / `zoomOut` / `zoomReset` (0.5 steps, clamped to ±3), `getZoomLevel`, `setZoomLevel`,
`getZoomFactor`, and `onZoomFactorChanged`.
