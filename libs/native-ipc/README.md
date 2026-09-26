# @koloda/native-ipc

Machine-checked contract for the desktop renderer↔main command surface: the `DataIpc`
channel map (`{ args; result }` per channel), the wire types only this boundary needs,
and the push-channel constants (`AI_STREAM_CHANNEL`, `APP_SHUTDOWN_*`, `WINDOW_*`).

## Where it sits

Consumed by `apps/electron` (main) and `apps/electron-react` (renderer); both processes
compile against it, so a channel rename or shape drift fails the build instead of
surfacing as "no handler" at runtime. The human-readable surface it enforces is
`apps/electron/IPC.md`.

## Architectural Map

- `src/index.ts` — the whole package: `DataIpc` contract, `DataChannel`/
  `DataOnlyChannel`/`IpcArgs`/`IpcResult` helpers, push-channel constants, `AiStreamEvent`.

### Does NOT own (prevent scope creep)

- Runtime logic — no invoke/bridge code lives here; the renderer bridge is
  `apps/electron-react/src/app/electron.ts`, main-side registration in `apps/electron/src/*-ipc.ts`
- Domain types — imported from `@koloda/app` / `@koloda/srs` / `@koloda/ai` / `@koloda/settings`
- AI profile secrets — deliberately no channel; secrets load main-side only (`ai-ipc.ts`)

## Read next

- `apps/electron/IPC.md` — command semantics, conventions, and streaming protocol
