# Typed IPC contract for the desktop data path

Status: done

## Intent

Renaming an IPC channel, misspelling a `KolodaDb` method, or changing an arg shape between renderer and main currently compiles and fails only at runtime ("No handler registered"). This work makes every junction of the desktop data path fail at typecheck instead, and gives channel names one source of truth.

Done when: `registerDataIpc` takes a typed `KolodaDb`, `data-ipc.ts` registers handlers from a contract-checked table, the renderer's `invoke` accepts only contract channels with contract arg/result types, and the duplicated `AI_STREAM_CHANNEL` constant is gone. No `any` remains on the desktop data path (`apps/native-electron/src/main.ts`, `data-ipc.ts`, `preload.ts`; renderer `apps/native-electron-react/src/app/electron.ts`).

Fixes architecture-review major #5 (tmp/audits/ARCHITECTURE-REVIEW.md).

## Scope

In:

- New source-only lib `libs/native-ipc` (`@koloda/native-ipc`): the channel→`{args, result}` contract for data and AI commands, derived helper types, `AI_STREAM_CHANNEL`, `AiStreamEvent`.
- Hand-written `KolodaDb` interface for the NAPI addon class; typed `loadNativeAddon()` and `registerDataIpc(db)`.
- `data-ipc.ts` rewritten as a `{ channel, handler }` table checked against the contract.
- Renderer bridge `electron.ts` and `preload.ts` typed from the contract; `queries.ts` / `ai-runtime.ts` call sites simplified.
- `apps/native-electron/IPC.md` updated in the same changes as the code it documents.

Out:

- Window/lifecycle channels (`window:*`, `app:shutdown-*`, `window:maximize-changed`) and zoom controls (preload-local `webFrame`, no IPC) — see open questions.
- Payload reshaping: the three arg conventions (`{ params }` reads, `{ data }` writes, plain object) stay as they are; the contract describes them, it does not unify them.
- Typing payloads across the NAPI seam (Rust methods take/return `serde_json::Value`; out of #5's scope by the audit's own note).
- Runtime validation (Zod etc.) at the bridge — this is typecheck coverage only.
- The demo app (web, no IPC).

## Open questions

- [ ] Do window/lifecycle channels (`window:*`, `app:shutdown-*`, `window:maximize-changed`) join the contract too, or stay string-typed? Default is out (separate seam, fewer call sites); adding them later is one more plan item and does not change items 1–3. — open

## Plan

- [x] 1. Type the native addon boundary and add the contract lib
  Goal: Create `libs/native-ipc` (`@koloda/native-ipc`, tag `type:lib`, `projectType: library`) mirroring `libs/e2e` scaffolding: package.json with `"type": "module"` and `exports` → `src/index.ts`, project.json, solution-style tsconfigs; empty runtime deps. Its barrel exports a `DataIpc` interface mapping every channel in `apps/native-electron/src/data-ipc.ts` (~50 entries) to `{ args; result }`, with types imported from `@koloda/srs`, `@koloda/app`, `@koloda/ai` (the same types `apps/native-electron-react/src/app/queries.ts` already uses), plus derived `DataChannel = keyof DataIpc`, `IpcArgs<C>`, `IpcResult<C>`. In `apps/native-electron`, add `src/koloda-db.ts` with a hand-written `KolodaDb` interface covering every method the handlers call, arg/result types from the contract; deliberately no `getAiProfileSecrets` (INVARIANT: secrets stay main-side). Change `loadNativeAddon()` to return `{ KolodaDb: new (dbPath: string) => KolodaDb }` and `registerDataIpc(db: KolodaDb)`. Handler arg destructuring stays as-is until item 2. Use `import type` statements separate from value imports (oxlint `separate-type-imports`). Run `bun install` and `bunx nx sync` for the workspace entry and project references.
  Constraints: Contract lib holds no runtime code beyond the type map; no changes to `ai-ipc.ts` yet; no handler restructure; do not touch wire format (`toWire`/`fromWire`).
  Done when: `bunx nx typecheck @koloda/native-ipc @koloda/native-electron` and lint pass; `rg 'any' apps/native-electron/src/main.ts apps/native-electron/src/data-ipc.ts` shows no `db: any` or `=> any`; dprint fmt clean.
  Commit: Add typed IPC contract and type the native addon boundary
  Depends on: none

- [x] 2. Register data IPC handlers from a typed table
  Goal: Rewrite `apps/native-electron/src/data-ipc.ts` from ~50 `ipcMain.handle(...)` calls to one `dataHandlers` object keyed by channel, each entry `(db, args: IpcArgs<C>) => ...` calling the `KolodaDb` method, `satisfies { [C in DataChannel]: (db: KolodaDb, args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>> }`, registered with a single loop (`Object.entries` + one `ipcMain.handle`). Keep the INVARIANT comment; `getAiProfileSecrets` appears nowhere. Keep each channel's existing arg destructuring and wire payload exactly (behavior-neutral). Update `apps/native-electron/IPC.md` Conventions to name `libs/native-ipc` as the machine-checked source of truth for channel names.
  Constraints: Main-process files only; no renderer or preload changes; no payload reshaping or convention unification.
  Done when: `bunx nx typecheck @koloda/native-electron` and lint pass; every channel string in `data-ipc.ts` appears exactly once, as an object key of the table; dprint fmt clean.
  Commit: Register data IPC handlers from a typed table
  Depends on: 1

- [x] 3. Type the renderer bridge from the contract and dedupe the AI channel
  Goal: Move AI types into the contract lib: `AI_STREAM_CHANNEL`, `AiStreamEvent`, and the three AI command arg types from `ai-ipc.ts`; add the `cmd_ai_list_models` / `cmd_ai_chat_stream` / `cmd_ai_abort` entries to the contract (or an `AiIpc` sibling map with shared helpers). In `apps/native-electron/src/ai-ipc.ts`, import them from the lib. In `apps/native-electron-react/src/app/electron.ts`, change `invoke` to `<C extends DataChannel>(channel: C, args: IpcArgs<C>): Promise<IpcResult<C>>` and thread the AI stream channel through it; drop the casts and explicit generics this makes unnecessary in `queries.ts`, `ai-runtime.ts`, and `setup.ts`. In `preload.ts`, give `invoke` the same signature via a type-only import (preload is swc-compiled standalone — runtime imports from workspace libs must not be introduced). Delete the duplicated `AI_STREAM_CHANNEL` from `ai-runtime.ts`. Update `apps/native-electron/IPC.md` (renderer bridge section) in the same change.
  Constraints: `preload.ts` stays a dumb bridge (type-only import); no behavior change to stream event flow or error parsing; window channels unchanged.
  Done when: `bunx nx typecheck @koloda/native-electron @koloda/native-electron-react` and lint pass; `rg -n '"ai:stream"' apps` finds nothing; dprint fmt clean; `bunx nx run native-electron-e2e:e2e` shows no failures beyond the known pre-existing list in tmp/audits/ARCHITECTURE-REVIEW.md handoff (failing-tests list), with keyboard-reorder specs still passing.
  Commit: Share the IPC contract with the renderer
  Depends on: 1

## Outcome

Shipped in `9714f2d`, `e87504b`, `c7bdaf4` (2026-09-06). `@koloda/native-ipc` carries the machine-checked `DataIpc` contract — all 46 data channels plus the 3 AI commands, `AI_STREAM_CHANNEL`, and `AiStreamEvent` — consumed by preload (type-only import), `data-ipc.ts` (handler table), `ai-ipc.ts`, and the renderer bridge, whose `invoke` now accepts only contract keys. `KolodaDb` is a typed NAPI mirror without `getAiProfileSecrets`; ai-ipc keeps its own secrets-capable narrow view (one intersection cast in `registerDataIpc`). Two contract truths corrected against Rust: `cmd_submit_lesson_result` → `void`, `cmd_add/update_ai_profile` → `AIProfile`; the renderer adapter reconciles both without touching the `Queries` interface in core-react. Native e2e: 79/79. Window/lifecycle channels remain string-typed (open question resolved as the default: out).
