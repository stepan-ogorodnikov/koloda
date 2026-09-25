# @koloda/ai

Provider-agnostic AI abstraction: streams chat completions from any registered provider, validates per-provider secrets, and derives pure conversation helpers. Framework-agnostic — no React, no DB, no conversation state. The TS provider enum and secrets schema mirror Rust; Rust is the source of truth.

## Where it sits

Consumed by host `AIRuntime` adapters (Electron main / web) for provider HTTP, and by `libs/ai-react` / `libs/assistant-react/src/lib` for types, pure helpers, and the `AIRuntime` contract.
Shared React must not call `createAIGenerationClient` with secrets.
See §AIRuntime below.
Mirrors the provider enum and secrets schema in `crates/koloda` (`domain/ai.rs` + `repo/ai.rs` for redaction/reconstruction); the two must stay in sync — see `agents/ADD-AI-PROVIDER.md`.
Talks to provider HTTP endpoints via the Vercel AI SDK (`ai` package) and per-provider SDK packages, dynamically imported.

**Task routing:** `agents/ASSISTANT-MAP.md`.
This README owns the package boundary.

## Architectural Map

- Provider registry & abstraction seam: `providers/` — one module per provider (`openrouter.ts`, `ollama.ts`, …) owning fetchModels + createClient + secrets probes; `provider-registry.ts` holds `AIGenerationClient` / `AIProviderEntry` types and wires `AI_PROVIDER_REGISTRY`. Adding a provider = one new file under `providers/` + one registry line (+ export from `src/index.ts` if public).
- Provider catalog (TS half of the Rust mirror): `provider-catalog.ts` — `AI_PROVIDER_LABELS` / `AiProvider` / base URLs; `provider-secrets.ts` — per-provider zod schemas and `aiSecretsValidation` discriminated union.
- Settings & profiles: `settings.ts` — profile/settings zod schemas, CRUD DTOs.
- Models & generation contracts: `models.ts` (`AIModel`, `ModelParameter`, `StreamUsage`); `generation.ts` (chat request types, `chatInputSchema`).
- Chat streaming: `chat-stream.ts` — shared `runChatStream` for all providers over Vercel AI SDK `streamText`. Note the `streamedError` pattern: errors are captured in `onError` and re-thrown after stream iteration, because `for await` may swallow them. Per-provider wrappers only supply the model factory (and optional `providerOptions`). Temperature comes from the request or falls back to `GENERATION_TEMPERATURE`.
- Assistant tools: `assistant-tools.ts` — specs for `list_decks`, `list_templates`, `list_algorithms`, `get_deck`, `get_template`, `get_deck_cards`, `add_deck`, and `propose_cards`, input binding, output shaping and budgets; `assistant-tool-executor.ts` — the shared executor, awaiting a host-injected `AssistantToolDataSource` (web SQLite, Electron NAPI). `add_deck` validates then calls host `createDeck`; card content still goes through `propose_cards`. No I/O in this module — hosts bind data sources.
- Prompts: `prompts.ts` — default chat prompt template and `GENERATION_TEMPERATURE`. Field titles come from tools, not the system prompt. `chat-stream.ts` trims the saved (or default) prompt when sending.
- Conversation helpers (pure): `conversations.ts` — `getTextMessageContent` and `computeConversationTitle` (255-char truncation) over Vercel AI SDK `UIMessage`. No state.
- Errors: `error.ts` — `AIError`, `throwForAIResponse` (HTTP → `AIError`), `wrapAIError`. `error-ai.ts` — the AIError→AppError bridge (`formatGenerateError`, `toAIAppError`), exported via the `./app-error` subpath (renderer-only: it pulls `@koloda/app`, whose error catalog uses compile-time Lingui macros with no runtime export, so the root barrel must stay free of it for the Electron main process).
- Reasoning levels: `providers/openrouter.ts` (API-provided); Ollama/Cloud from `/api/tags` `capabilities` including `thinking` (GPT-OSS: low/medium/high, default medium; other thinking models: on/off mapped to boolean `think`, default on); LM Studio overlays `/api/v1/models` `capabilities.reasoning` onto `/v1/models` (picker hidden when the native list is unavailable or a model has no `allowed_options`; native `off`/`on` map to OpenAI-compatible `none`/`medium`); OpenAI joins models.dev effort options by model id (`openai`); DeepSeek joins them by model id (`deepseek`), with `resolveReasoningLevelsForModel` as a prefix fallback when the catalog is unavailable or the id is missing; OpenCode Zen/Go do the same (`opencode` / `opencode-go`). The same join fills `context_length` and `top_provider.max_completion_tokens` from models.dev `limit.context` / `limit.output` when the gateway omitted them (no prefix fallback).
- Reasoning extraction: `model-reasoning-extraction.ts` — `wrapModelWithReasoningExtraction` strips ` thinking`-tagged chain-of-thought from the text stream.
- Host runtime contract: `runtime.ts` — `AIRuntime` (`listModels` / `chat` by `profileId`). Hosts implement; shared React injects via `aiRuntimeAtom`.

### Does NOT own (prevent scope creep)

- Conversation / run lifecycle state — `libs/assistant-react/src/lib` (policy + React); stream execution lifetime — `@koloda/assistant` + host `AIRuntime`
- Persistence schema & secrets storage — `@koloda/db-sqlite` + `crates/koloda/src/repo`
- Presentational AI UI (message shells, pickers, tool-activity chrome) — `libs/ai-react`
- The canonical provider enum — Rust (`crates/koloda/src/domain/ai.rs`) is source of truth; this lib mirrors it

## AIRuntime

Shared React never builds provider clients or holds usable API keys.
Hosts inject `aiRuntimeAtom` (`libs/core-react`).
Assistant chat uses that runtime through `useAssistantClient`.
The application-shell engine host builds one `AssistantExecutionPort`.
That port calls `AIRuntime` with the command's `profileId`.
Do not reintroduce a module-level generator slot or optional `execution` / stream-generator getters.

| Host | Adapter | Secrets |
|------|---------|---------|
| Electron | `apps/electron-react` `ai-runtime.ts` over IPC; main `apps/electron/src/ai-ipc.ts`; window-close handshake `window-close-coordinator.ts` ↔ `electron-close-coordination.ts` | Keyring via NAPI in main only |
| Web | `apps/web/src/app/ai-runtime.ts` | Host-local SQLite read at call time |

Public profile reads are redacted (`apiKey: null` + `hasSecrets`).
Settings add/replace still writes keys.
Edit UI uses `hasSecrets` for Replace.

## Read next

- `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` — Rust owns provider identity; this lib mirrors it
- `agents/ASSISTANT-MAP.md` — task routing
- `agents/ADD-AI-PROVIDER.md` — step-by-step across all 5 layers (TS types, Rust domain, Rust repo, registry, streaming)
- `agents/ADD-ASSISTANT-TOOL.md` — adding a chat tool (spec, executor, both host binders, activity label)
- `docs/specs/ASSISTANT-CONVERSATIONS.md` — run lifecycle and history
- `docs/specs/ASSISTANT-CONVERSATION-LIST.md` — conversation title rules (`computeConversationTitle`)
