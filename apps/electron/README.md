# @koloda/electron

Electron host: the main process, the preload bridge, and the Rust NAPI addon that owns the desktop database.
No UI — the renderer is `apps/electron-react`; no domain logic — that lives in `crates/koloda`.

## Where it sits

Owns the window, app lifecycle, and every main-process IPC channel (`IPC.md`).
Data access and AI provider calls happen here; AI secrets never reach the renderer.
The addon (`src-rust/`) is a thin `koloda` façade — the TS/Rust mirroring rationale is ADR 0001.

## How to run

- `nx run @koloda/electron:serve` — dev: boots the renderer dev server, builds the Rust addon, compiles the preload, launches Electron
- `nx run @koloda/electron:build` — packaged installer via electron-builder into `dist-pack/`
- `nx run @koloda/electron:build-rust` — `cargo build` of the addon plus copy into `dist/`
- `nx run @koloda/electron:test` — unit + renderer unit + e2e; `-c unit` / `-c e2e` select a subset
- `nx run @koloda/electron:typecheck`, `nx run @koloda/electron:lint`

## Architectural Map

- Main: `src/main.ts` — bootstrap only: user-data paths (`KOLODA_USER_DATA` override; per-platform
  defaults), native addon loading, IPC registration, window creation. `src/env.ts` holds the dev
  flag and the main entry dir behind dev/packaged path joins.
- Window: `src/window.ts` — hidden-titlebar window creation, packaged-mode reload blocking,
  titlebar overlay/button metrics, close-coordination wiring.
- Window state & UI prefs: `src/window-state.ts` / `src/ui-prefs.ts` — `window-state.json` bounds and
  `ui-prefs.json` colors persisted in user data.
- Window IPC: `src/window-ipc.ts` — `window:*` channels plus the shutdown ack. See `IPC.md`.
- Data IPC: `src/data-ipc.ts` — `cmd_*` channels over the NAPI addon. See `IPC.md`.
- AI IPC: `src/ai-ipc.ts` — model listing, streaming chat with per-request abort, main-side tool executor. See `IPC.md`.
- Close handshake: `src/window-close-coordinator.ts` — bounded 2500 ms shutdown request/ack so the renderer flushes before destroy.
- Preload: `src/preload.ts` — `contextBridge` exposes `electronAPI`: generic `invoke`/`on` plus `webFrame` zoom controls.
- Rust addon: `src-rust/` — `koloda-electron` cdylib; `KolodaDb` NAPI façade over `koloda` (SQLite at `<userData>/koloda.db`).
- Bundling scripts: `scripts/` —
  - `bundle-main.ts` — rolldown bundle of `src/main.ts` to a single CJS `dist/main.cjs` for the release asar
    (AI SDK deps inlined; `import.meta` remapped to CJS equivalents)
  - `copy-native-addon.ts` — dev: copies the cargo-built addon into `dist/` (honors `CARGO_TARGET_DIR`)
  - `copy-native-release.ts` — packaged: same copy from the fixed workspace `target/release` path
- Packaging: `electron-builder.yml` — `dist/` flattened into the asar root beside `preload.js` and the `.node` addon,
  the built renderer included from workspace `dist/apps/electron-react` as extra resources;
  NSIS (win), dmg/zip (mac), AppImage/deb (linux).

### Does NOT own (prevent scope creep)

- UI and routes — `apps/electron-react`
- Domain, validation, scheduling — `crates/koloda` (mirrors `@koloda/srs` / `@koloda/app`)
- AI SDK shaping, budgets, and provider clients — `@koloda/ai` (main only hosts them)
- E2E — `apps/electron-e2e`

## Read next

- `IPC.md` — the full renderer ↔ main channel contract
- `apps/electron-react/README.md` — the renderer
- `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` — why TS and Rust both exist
- `agents/RUST.md` — the domain crate below the addon
