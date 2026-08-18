# @koloda/assistant

Framework-free assistant application layer: per-conversation runtimes, serial command queues, run-scoped AbortControllers, persistence scheduling, graceful shutdown, and the shared stream funnel.
No React, no Jotai, no TanStack Query, no UI, no repository I/O.

## Where it sits

Consumed by `@koloda/srs-react` via an application-shell engine host (`useAssistantEngineHost`) that injects store callbacks, a required `AssistantExecutionPort`, and a durable-write adapter for persistence.
Depends on `@koloda/ai` (stream/request types), `@koloda/app` (abort/error helpers), and `@koloda/srs` (template fields for card runs).
Conversation documents and reducer policy still live in `@koloda/srs-react`; this package owns run **execution lifetime**, **per-conversation save queue scheduling**, and **graceful shutdown** so chat unmount does not abort background streams or dispose pending flushes.

**Ownership source of truth for assistant chat:** `agents/ASSISTANT-CHAT-MAP.md` — prefer that map over this README when routing assistant edits.

## Architectural Map

- Engine: `assistant-engine.ts` — `createAssistantEngine` / `AssistantEngine`.
  Lazy per-conversation runtimes; typed `dispatch(command)` is the **sole execution ingress** (`submit` / `retry` / `cancel` / `shutdown`).
  Runtime `executeChatRun` / `retryRun` are private.
  Non-execution lifecycle: `setPersistenceHost` / `disposeConversation` / `dispose`.
- Protocol: `assistant-protocol.ts` — framework-free `AssistantCommand` and `AssistantEvent` contracts.
  Store adapters (e.g. Jotai in `@koloda/srs-react`) translate events into reducer actions; the engine never emits reducer tuples.
- Execution identity / port: `assistant-execution-port.ts` — each submit/retry command carries immutable non-secret `AssistantExecutionIdentity` (`profileId`).
  `ConversationRuntimeTransports.executionPort` is **required**.
  The host port resolves credentials from `profileId` at call time.
  There are no `getChatStreamGenerator` / `getStreamGenerator` getters and no mutable transport slot.
- Observability: `assistant-observability.ts` — structured `[assistant.transition]` logs keyed by conversation/run ids, optional host `requestId`, command/event, prior/next status, termination reason, and save generation/attempt.
  Low-volume persistence events: `saveStart`/`saveAck`/`saveFailed`, `deleteBegin`/`deleteCommit`/`deleteRollback`; engine commands and `shutdown` are logged in `assistant-engine.ts`.
  Stream start (`streamStart` + `requestId`) is logged at the host execution port; Electron IPC uses the same `requestId`. Do not log token chunks, card payloads, or secrets.
- Persistence: `conversation-persistence-host.ts`, `create-conversation-save-queue.ts`, `create-save-scheduler.ts` — engine-owned per-conversation serialized save queues; failed writes retry with bounded exponential backoff + jitter; `retrySave` for explicit recovery.
  Production delete is transactional: `beginDelete` (tombstone + cancel queued + await in-flight) → DB delete → `commit`, or `rollback` (clear tombstone, preserve dirty, resume autosave).
  `prepareDelete` is a convenience that permanently tombstones (`beginDelete` then `commit`) for callers that cannot roll back; production uses `beginDelete` + commit/rollback.
  `SHUTDOWN_FLUSH_TIMEOUT_MS` (2000 ms) and `SHUTDOWN_SAVE_MAX_ATTEMPTS` (3) bound the best-effort final flush on graceful shutdown.
- Conversation runtime: `conversation-runtime.ts` — serial command queue and chat/retry execution against the injected execution port + by-id ports (`emit`, `touch`, `markReadIfCurrent`, `readConversationState`, `isRunStreaming`).
  At most one active or queued execute/retry per conversation; a second command throws `AssistantDuplicateRunError` before occupancy is claimed.
- Controllers: `run-controller-registry.ts` — engine-owned `AbortController` map keyed by `runId` (cancel isolation; shutdown/dispose aborts all).
  Closed-registry `beginRun` becomes a typed interrupt, not a bare throw that leaves the run `streaming`.
- Stream funnel: `run-stream.ts` — shared `runStream` success / fail / abort handling used by chat.
- Serial queue: `serial-queue.ts` — per-conversation command serialization (one hop per public execute entry; retry must not re-enqueue through those entry points).
- Types / helpers: `stream-result.ts`, `display-error.ts`.

### Does NOT own (prevent scope creep)

- Conversation reducer, Jotai store, dirty tracking — `@koloda/srs-react` (`assistant/state/`)
- Repository writes / TanStack Query cache updates — `@koloda/srs-react` (`useConversationSaveHost` write adapter)
- `RunController` UI facade / submit orchestration — `@koloda/srs-react` (`assistant/runs/`; validation + request prep in `prepare-run-request.ts`; command acceptance then `submitTurn` in `use-run-orchestration.ts`)
- Chat UI, cards table, settings screens — `@koloda/srs-react` (`assistant/ui/`)
- Provider HTTP / `AIRuntime` host adapters — `@koloda/ai` + Electron/demo hosts
- Generic presentational chat chrome — `@koloda/ai-react`

## Command ingress and duplicate runs

Production submit/retry/cancel/shutdown all go through `engine.dispatch`.
`@koloda/srs-react` prepares the command in `prepare-run-request.ts`, then `useRunOrchestration` calls `dispatch` and only then applies `submitTurn`.
A synchronous reject (duplicate or closed engine) must not leave a streaming placeholder; `rollbackSubmitTurn` covers a later async reject.

The runtime claims occupancy only after enqueue succeeds.
Same-tick duplicate submit/retry throws `AssistantDuplicateRunError`.
UI disable-submit is not sufficient.

## Graceful shutdown

On real unload `pagehide` / `beforeunload`, the application-shell host dispatches a typed `shutdown` command via `shutdownAssistantGracefully` (best-effort in browsers/demo — the platform does not await flush promises).
A bfcache `pagehide` (`PageTransitionEvent.persisted === true`) skips terminal shutdown so a later `pageshow` can reuse the same engine.
Electron additionally runs a main-process window-close handshake (`apps/native-electron` `window-close-coordinator` + renderer `installElectronCloseCoordination`) that requests shutdown, awaits a bounded ack, then allows close (or force-destroys after `WINDOW_CLOSE_SHUTDOWN_TIMEOUT_MS`).
Concurrent unload + IPC callers share one engine shutdown promise (single-flight) so acknowledgement waits for the joined flush:

1. Interrupt every `streaming` run in memory (`interrupted` / `app_shutdown`) and dirty the originating conversation.
2. Abort all in-flight stream controllers.
3. `flushAllBounded(SHUTDOWN_FLUSH_TIMEOUT_MS)` — best-effort durable flush within **2000 ms**; in-flight writes may still complete after the timeout.

Orphaned `streaming` checkpoints left on disk after a crash are normalized to `interrupted` / `crash_recovery` on restore (`@koloda/srs-react`).

## Read next

- `agents/ASSISTANT-CHAT-MAP.md` — task routing and layer boundaries
- `docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md` — run lifecycle and streaming rules
- `docs/specs/ASSISTANT-CHAT-CARD-GENERATION.md` — card generation behavior
