# @koloda/ai

Provider-agnostic AI abstraction: streams chat completions and generates structured cards from any registered provider, validates per-provider secrets, and derives pure conversation helpers. Framework-agnostic — no React, no DB, no conversation state. The TS provider enum and secrets schema mirror Rust; Rust is the source of truth.

## Where it sits

Consumed by `libs/ai-react` and `libs/srs-react/.../assistant` (types, client factory, pure helpers). Mirrors the provider enum and secrets schema in `crates/koloda-core` (`domain/ai.rs` + `repo/ai.rs` for redaction/reconstruction); the two must stay in sync — see `agents/ADD-AI-PROVIDER.md`. Talks to provider HTTP endpoints via the Vercel AI SDK (`ai` package) and per-provider SDK packages, dynamically imported.

**Ownership source of truth:** `agents/ASSISTANT-CHAT-MAP.md` — prefer that map over package READMEs when routing edits.

## Architectural Map

- Provider registry & abstraction seam: `providers/` — one module per provider (`openrouter.ts`, `ollama.ts`, …) owning fetchModels + createClient + secrets probes; `provider-registry.ts` holds `AIGenerationClient` / `AIProviderEntry` types and wires `AI_PROVIDER_REGISTRY`. Adding a provider = one new file under `providers/` + one registry line (+ export from `src/index.ts` if public).
- Provider catalog (TS half of the Rust mirror): `provider-catalog.ts` — `AI_PROVIDER_LABELS` / `AiProvider` / base URLs; `provider-secrets.ts` — per-provider zod schemas and `aiSecretsValidation` discriminated union.
- Settings & profiles: `settings.ts` — profile/settings zod schemas, CRUD DTOs, `DEFAULT_AI_SETTINGS`.
- Models & generation contracts: `models.ts` (`AIModel`, `ModelParameter`, `StreamUsage`); `generation.ts` (`AIChatMode`, chat/card request types, `generateCardsInputSchema`).
- Chat streaming: `chat-stream.ts` — per-provider `streamChatWith<Provider>` functions over Vercel AI SDK `streamText`. Note the `streamedError` pattern: errors are captured in `onError` and re-thrown after stream iteration, because `for await` may swallow them.
- Card generation (two strategies): `card-generation.ts` — `runStructuredCardGeneration` streams structured elements via `Output.array` (OpenRouter, OpencodeGo); `runTextCompletionCardGeneration` does a text completion then parses (Ollama, LMStudio). The structured path also falls back to text parsing if no elements arrive.
- Card parsing & schema: `card-parsing.ts` — `getCardContentSchema` (zod schema per template fields), `parseGeneratedCardsText` (text → cards), `resolveGenerationTemperature`.
- Prompt compilation: `prompts.ts` — default prompt templates, `GENERATION_TEMPERATURE`, and `compilePromptTemplate` (fields/rules/provider/mode injection).
- Conversation helpers (pure): `conversations.ts` — `getTextMessageContent` and `getConversationName` (48-char truncation) over Vercel AI SDK `UIMessage`. No state.
- Errors: `error.ts` — `AIError`, `throwForAIResponse` (HTTP → `AIError`), `wrapAIError`.
- Reasoning levels: `providers/openrouter.ts` (API-provided); `providers/openai-compatible.ts` hardcodes deepseek-* / mimo-* via `resolveReasoningLevelsForModel` (Opencode Go/Zen).
- Compatibility: `types.ts` re-exports the domain modules above; prefer importing from the specific files.

### Does NOT own (prevent scope creep)

- Conversation / run lifecycle state — `libs/srs-react/.../assistant`
- Persistence schema & secrets storage — `drizzle/` + `crates/koloda-core/repo`
- UI rendering / streaming hooks — `libs/ai-react`
- The canonical provider enum — Rust (`crates/koloda-core/domain/ai.rs`) is source of truth; this lib mirrors it

## Read next

- `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` — Rust owns provider identity; this lib mirrors it
- `agents/ASSISTANT-CHAT-MAP.md` — task routing and layer boundaries
- `agents/ADD-AI-PROVIDER.md` — step-by-step across all 5 layers (TS types, Rust domain, Rust repo, registry, streaming/generation)
- `docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md` — the domain behavior this lib serves
