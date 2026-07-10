# @koloda/ai

Provider-agnostic AI abstraction: streams chat completions and generates structured cards from any registered provider, validates per-provider secrets, and derives pure conversation helpers. Framework-agnostic — no React, no DB, no conversation state. The TS provider enum and secrets schema mirror Rust; Rust is the source of truth.

## Where it sits

Consumed by `libs/ai-react` and `libs/srs-react/.../assistant` (types, client factory, pure helpers). Mirrors the provider enum and secrets schema in `crates/koloda-core` (`domain/ai.rs` + `repo/ai.rs` for redaction/reconstruction); the two must stay in sync — see `agents/ADD_AI_PROVIDER.md`. Talks to provider HTTP endpoints via the Vercel AI SDK (`ai` package) and per-provider SDK packages, dynamically imported.

**Ownership source of truth:** `agents/ASSISTANT-CHAT-MAP.md` — prefer that map over package READMEs when routing edits.

## Architectural Map

- Provider registry & abstraction seam: `provider-registry.ts` — `AI_PROVIDER_REGISTRY` maps each provider to a client factory, model fetcher, missing-secrets probe, and api-key getter. `AIGenerationClient` is the uniform interface (listModels, chat, generateCards). Adding a provider = one registry entry.
- Provider enum & secrets (TS half of the Rust mirror): `types.ts` — `AI_PROVIDER_LABELS` (openrouter, ollama, lmstudio, opencodeGo, codex), zod `secretsValidation` discriminated union keyed by provider, `AIModel` type with reasoning levels, prompt template constants.
- Chat streaming: `chat-stream.ts` — per-provider `streamChatWith<Provider>` functions over Vercel AI SDK `streamText`. Note the `streamedError` pattern: errors are captured in `onError` and re-thrown after stream iteration, because `for await` may swallow them.
- Card generation (two strategies): `card-generation.ts` — `runStructuredCardGeneration` streams structured elements via `Output.array` (OpenRouter, OpencodeGo); `runTextCompletionCardGeneration` does a text completion then parses (Ollama, LMStudio). The structured path also falls back to text parsing if no elements arrive.
- Card parsing & schema: `card-parsing.ts` — `getCardContentSchema` (zod schema per template fields), `parseGeneratedCardsText` (text → cards), `resolveGenerationTemperature`.
- Prompt compilation: `prompts.ts` — `compilePromptTemplate` injects fields, rules, provider, and mode into the template strings from `types.ts`.
- Conversation helpers (pure): `conversations.ts` — `getTextMessageContent` and `getConversationName` (48-char truncation) over Vercel AI SDK `UIMessage`. No state.
- Errors: `error.ts` — `AIError`, `throwForAIResponse` (HTTP → `AIError`), `wrapAIError`.
- Reasoning levels: `provider-registry.ts` — OpenRouter models get levels from the API; deepseek-* and mimo-* model IDs get hardcoded levels via `resolveReasoningLevelsForModel`.

### Does NOT own (prevent scope creep)

- Conversation / run lifecycle state — `libs/srs-react/.../assistant`
- Persistence schema & secrets storage — `drizzle/` + `crates/koloda-core/repo`
- UI rendering / streaming hooks — `libs/ai-react`
- The canonical provider enum — Rust (`crates/koloda-core/domain/ai.rs`) is source of truth; this lib mirrors it

## Read next

- `agents/ASSISTANT-CHAT-MAP.md` — task routing and layer boundaries
- `agents/ADD_AI_PROVIDER.md` — step-by-step across all 5 layers (TS types, Rust domain, Rust repo, registry, streaming/generation)
- `docs/specs/ASSISTANT-CHAT-CONVERSATIONS.md` — the domain behavior this lib serves
