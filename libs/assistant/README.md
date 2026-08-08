# @koloda/assistant

Framework-free assistant application layer: per-conversation runtimes, serial command queues, run-scoped AbortControllers, and the shared stream funnel.
No React, no Jotai, no TanStack Query, no UI, no persistence I/O.

## Where it sits

Consumed by `@koloda/srs-react` via a route-scoped engine host (`useAssistantEngineHost`) that injects store callbacks and AI transports.
Depends on `@koloda/ai` (stream/request types and generators), `@koloda/app` (abort/error helpers), and `@koloda/srs` (template fields for card runs).
Conversation documents, reducer policy, and autosave still live in `@koloda/srs-react`; this package owns run **execution lifetime** so chat unmount does not abort background streams.

**Ownership source of truth for assistant chat:** `agents/ASSISTANT-CHAT-MAP.md` — prefer that map over this README when routing assistant edits.

## Architectural Map

- Engine: `assistant-engine.ts` — `createAssistantEngine` / `AssistantEngine`. Lazy per-conversation runtimes; public API for arm / execute chat / execute generate / retry / cancel / dispose.
- Conversation runtime: `conversation-runtime.ts` — plain runtime with a serial command queue and chat/card/retry execution against injected transports + callbacks (`dispatch`, `dispatchToConversation`, `touch`, `markReadIfCurrent`, `readState`).
- Controllers: `run-controller-registry.ts` — engine-owned `AbortController` map keyed by `runId` (cancel isolation; dispose aborts all).
- Pending refs: `pending-run-refs.ts` — arm / onComplete tracking for in-flight runs.
- Stream funnel: `run-stream.ts` — shared `runStream` success / fail / abort handling used by chat and card paths.
- Serial queue: `serial-queue.ts` — per-conversation command serialization (one hop per public execute entry; retry must not re-enqueue through those entry points).
- Types / helpers: `stream-result.ts`, `card-generation.ts` (executor/request types), `display-error.ts`.

### Does NOT own (prevent scope creep)

- Conversation reducer, Jotai store, dirty tracking — `@koloda/srs-react` (`assistant/state/`)
- Autosave queues / repository writes — `@koloda/srs-react` (`assistant/persistence/`) + host repos
- `RunController` UI facade / submit orchestration — `@koloda/srs-react` (`assistant/runs/`)
- Chat UI, cards table, settings screens — `@koloda/srs-react` (`assistant/ui/`)
- Provider HTTP / `AIRuntime` host adapters — `@koloda/ai` + Electron/demo hosts
- Generic presentational chat chrome — `@koloda/ai-react`

## Read next

- `agents/ASSISTANT-CHAT-MAP.md` — task routing and layer boundaries
- `docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md` — run lifecycle and streaming rules
- `docs/specs/ASSISTANT-CHAT-CARD-GENERATION.md` — card generation behavior
- `ASSISTANT-ARCHITECTURE-REWORK.md` — engine extraction / persistence ownership roadmap (repo root)
