# @koloda/native-electron-react

Desktop renderer: the full UI in Electron's web layer, talking to the Rust core in the main process over IPC.
No direct database access — every query and mutation crosses the IPC bridge.

## Where it sits

Assembles the `@koloda/app-react` screens on top of `window.electronAPI` (the preload bridge).
The Electron main process and preload live in `apps/native-electron`; the Rust core in `crates/` owns the data.
Normally booted by `nx run native-electron:serve`; runs standalone in a browser via its own serve target.

## How to run

- `nx run native-electron:serve` — full desktop app: renderer dev server, Rust addon, Electron
- `nx run native-electron-react:serve` — renderer alone at `localhost:3000`
- `nx run native-electron-react:test` — unit tests
- `nx run native-electron:build` — packaged build via electron-builder
- `nx run native-electron-react:lingui-extract` / `:lingui-compile` — locale catalogs

## Architectural Map

- Entry: `src/main.tsx` — hash history under `file://`, close coordination.
- Zoom: `src/app/use-electron-zoom.ts` — ctrl/⌘ ±/0 and ctrl+wheel, level persisted across restarts.
- IPC bridge: `src/app/electron.ts` — typed `window.electronAPI` wrapper; IPC error payloads become `AppError`.
- Wire format: `src/app/ipc.ts` — `toWire`/`fromWire` (Date to epoch ms, BigInt checks) for NAPI-safe payloads.
- AI runtime: `src/app/ai-runtime.ts` — streaming chat over the `ai:stream` channel; errors map to `AIError`.
- Queries: `src/app/queries.ts` — the `Queries` contract as `cmd_*` invokes against the Rust core.
- Setup: `src/app/setup.ts` — database status and seeding via IPC.
- Close coordination: `src/app/electron-close-coordination.ts` — durable interrupt and flush before window destroy.
- Store wiring: `src/app/store.ts` — jotai store, UI preferences, navigator locale detection.
- Chrome: `src/components/` — app entry with the blank-database setup gate, setup screen, titlebar.

### Does NOT own (prevent scope creep)

- Electron main process, preload, and bundling — `apps/native-electron`
- Domain logic and SQLite persistence — `crates/koloda-core`, mirroring `@koloda/srs` (ADR 0001)
- Screens, routes, settings UI — `@koloda/app-react`
- E2E harness — `apps/native-electron-e2e`

## Read next

- `apps/native-electron/IPC.md` — the channel contract this renderer speaks
- `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` — why TS and Rust both exist
- `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md` — why two DB engines exist
- `docs/specs/` — behavior specs
