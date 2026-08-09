# @koloda/assistant

Framework-free assistant application layer: per-conversation runtimes, serial command queues, run-scoped AbortControllers, persistence scheduling, graceful shutdown, and the shared stream funnel.
No React, no Jotai, no TanStack Query, no UI, no repository I/O.

## Where it sits

Consumed by `@koloda/srs-react` via a route-scoped engine host (`useAssistantEngineHost`) that injects store callbacks, AI transports, and a durable-write adapter for persistence.
Depends on `@koloda/ai` (stream/request types and generators), `@koloda/app` (abort/error helpers), and `@koloda/srs` (template fields for card runs).
Conversation documents and reducer policy still live in `@koloda/srs-react`; this package owns run **execution lifetime**, **per-conversation save queue scheduling**, and **graceful shutdown** so chat unmount does not abort background streams or dispose pending flushes.

**Ownership source of truth for assistant chat:** `agents/ASSISTANT-CHAT-MAP.md` — prefer that map over this README when routing assistant edits.

## Architectural Map

- Engine: `assistant-engine.ts` — `createAssistantEngine` / `AssistantEngine`. Lazy per-conversation runtimes; public API for arm / execute chat / execute generate / retry / cancel / `shutdownGracefully` / dispose.
- Persistence: `conversation-persistence-host.ts`, `create-conversation-save-queue.ts`, `create-save-scheduler.ts` — engine-owned per-conversation serialized save queues; failed writes retry with bounded exponential backoff + jitter; `retrySave` for explicit recovery; `SHUTDOWN_FLUSH_TIMEOUT_MS` (2000 ms) and `SHUTDOWN_SAVE_MAX_ATTEMPTS` (3) bound the best-effort final flush on graceful shutdown.
- Conversation runtime: `conversation-runtime.ts` — plain runtime with a serial command queue and chat/card/retry execution against injected transports + callbacks (`dispatch`, `dispatchToConversation`, `touch`, `markReadIfCurrent`, `readState`).
- Controllers: `run-controller-registry.ts` — engine-owned `AbortController` map keyed by `runId` (cancel isolation; shutdown/dispose aborts all).
- Pending refs: `pending-run-refs.ts` — arm / onComplete tracking for in-flight runs.
- Stream funnel: `run-stream.ts` — shared `runStream` success / fail / abort handling used by chat and card paths.
- Serial queue: `serial-queue.ts` — per-conversation command serialization (one hop per public execute entry; retry must not re-enqueue through those entry points).
- Types / helpers: `stream-result.ts`, `card-generation.ts` (executor/request types), `display-error.ts`.

### Does NOT own (prevent scope creep)

- Conversation reducer, Jotai store, dirty tracking — `@koloda/srs-react` (`assistant/state/`)
- Repository writes / TanStack Query cache updates — `@koloda/srs-react` (`useConversationSaveHost` write adapter)
- `RunController` UI facade / submit orchestration — `@koloda/srs-react` (`assistant/runs/`)
- Chat UI, cards table, settings screens — `@koloda/srs-react` (`assistant/ui/`)
- Provider HTTP / `AIRuntime` host adapters — `@koloda/ai` + Electron/demo hosts
- Generic presentational chat chrome — `@koloda/ai-react`

## Graceful shutdown

On `pagehide` / `beforeunload`, the route-scoped host calls `shutdownGracefully`:

1. Interrupt every `streaming` run in memory (`interrupted` / `app_shutdown`) and dirty the originating conversation.
2. Abort all in-flight stream controllers.
3. `flushAllBounded(SHUTDOWN_FLUSH_TIMEOUT_MS)` — best-effort durable flush within **2000 ms**; in-flight writes may still complete after the timeout.

Orphaned `streaming` checkpoints left on disk after a crash are normalized to `interrupted` / `crash_recovery` on restore (`@koloda/srs-react`).

## Read next

- `agents/ASSISTANT-CHAT-MAP.md` — task routing and layer boundaries
- `docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md` — run lifecycle and streaming rules
- `docs/specs/ASSISTANT-CHAT-CARD-GENERATION.md` — card generation behavior
- `ASSISTANT-ARCHITECTURE-REWORK.md` — engine extraction / persistence ownership roadmap (repo root)
