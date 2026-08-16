# Adding a New AI Provider

**Input REQUIRED from user**: provider key (camelCase), display name, secret fields (API key, base URL, etc.)

## Overview

AI providers require changes across 5 layers: TypeScript catalog/secrets, Rust domain, UI forms, streaming/generation, and provider registry.

## Workflow

### 1. TypeScript Catalog & Secrets

**`libs/ai/src/lib/provider-catalog.ts`** — add the provider label:

```typescript
export const AI_PROVIDER_LABELS = {
  // ...
  myProvider: "My Provider",
} as const;
```

**`libs/ai/src/lib/provider-secrets.ts`** — add secrets validation:

```typescript
// Form/input schema (required non-empty key):
export const myProviderSecretsValidation = z.object({
  apiKey: z.string().min(1, "validation.settings-ai.providers.apiKey"),
  // Optional fields:
  // baseUrl: z.url("validation.settings-ai.providers.baseUrl"),
});

// Add to AIPrompterSecrets union
export type AIPrompterSecrets =
  // ...
  | z.infer<typeof myProviderSecretsValidation>;

// Wire/storage schema uses `storedApiKey` (`string | null`; legacy "" → null):
export const aiSecretsValidation = z.discriminatedUnion("provider", [
  // ...
  z.object({ provider: z.literal("myProvider"), apiKey: storedApiKey }),
]);
```

### 2. Rust Domain (`crates/koloda-core/src/domain/ai.rs`)

Add provider to Rust constants and enum:

```rust
// Add to AI_PROVIDERS constant
pub const AI_PROVIDERS: &[&str] = &["openrouter", "ollama", "lmstudio", "myProvider"];

// Add variant to AISecrets enum
#[serde(rename = "myProvider")]
MyProvider {
    // INVARIANT: `None` = redacted/absent in settings JSON (`"apiKey": null`).
    #[serde(rename = "apiKey", alias = "api_key", deserialize_with = "deserialize_api_key")]
    api_key: Option<String>,
    // Optional: #[serde(rename = "baseUrl", alias = "base_url")]
    // base_url: String,
},

// Add to provider() method
AISecrets::MyProvider { .. } => "myProvider",

// api_key() already covers Option via the shared match arms — include MyProvider there.

// Add validation in validate_for_input()
AISecrets::MyProvider { api_key } => Self::require_api_key_for_input(api_key, "myProvider"),

// Add validation in validate_for_storage()
AISecrets::MyProvider { api_key } => Self::reject_stored_api_key(api_key, "myProvider"),
```

### 3. Rust Repository (`crates/koloda-core/src/repo/ai.rs`)

Add redaction and reconstruction for secrets:

```rust
// Add to redact_secrets()
AISecrets::MyProvider { .. } => AISecrets::MyProvider { api_key: None },

// Add to reconstruct_secrets()
AISecrets::MyProvider { .. } => AISecrets::MyProvider { api_key: Some(api_key) },
```

### 4. Provider module (`libs/ai/src/lib/providers/`)

Add one file per provider (e.g. `my-provider.ts`) that owns fetchModels, createClient, and the `AIProviderEntry`. Types (`AIGenerationClient`, `AIProviderEntry`) live in `provider-registry.ts`. Then wire the entry there. Reuse `openai-compatible.ts` helpers when the models API is OpenAI-compatible.

```typescript
// libs/ai/src/lib/providers/my-provider.ts
import { generateCardsWithMyProvider } from "../card-generation";
import { streamChatWithMyProvider } from "../chat-stream";
import { AIError, throwForAIResponse } from "../error";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import { isPresentApiKey, type AISecrets } from "../provider-secrets";
import type { AIModel } from "../models";

export async function fetchMyProviderModels(apiKey: string): Promise<AIModel[]> {
  const response = throwForAIResponse(
    await fetch("https://api.myprovider.com/models", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    }),
  );

  const data = await response.json();
  if (!Array.isArray(data.data)) throw new AIError("ai.invalid-response");

  return data.data
    .map((model: { id: string; name?: string; context_length?: number }) => ({
      id: model.id,
      name: model.name ?? model.id,
      context_length: model.context_length ?? 0,
    }))
    .sort((a: AIModel, b: AIModel) => a.name.localeCompare(b.name));
}

function createMyProviderClient(secrets: Extract<AISecrets, { provider: "myProvider" }>): AIGenerationClient {
  if (!isPresentApiKey(secrets.apiKey)) {
    throw new AIError("validation.settings-ai.providers.apiKey", "apiKey is required");
  }
  const resolved = { apiKey: secrets.apiKey };
  return {
    provider: "myProvider",
    listModels: () => fetchMyProviderModels(resolved.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithMyProvider(request, onChunk, abortSignal, resolved),
    generateCards: (request) => generateCardsWithMyProvider(request, resolved),
  };
}

export const myProviderEntry: AIProviderEntry = {
  id: "myProvider",
  // true if page-origin fetch can call this API (CORS). Otherwise false (Electron only).
  worksInBrowser: true,
  createClient: (secrets) => createMyProviderClient(secrets as Extract<AISecrets, { provider: "myProvider" }>),
  fetchModels: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "myProvider" }>;
    if (!isPresentApiKey(s.apiKey)) {
      throw new AIError("validation.settings-ai.providers.apiKey", "apiKey is required");
    }
    return fetchMyProviderModels(s.apiKey);
  },
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "myProvider" }>;
    return isPresentApiKey(s.apiKey) ? [] : ["apiKey"];
  },
  getApiKey: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "myProvider" }>;
    return isPresentApiKey(s.apiKey) ? s.apiKey : null;
  },
};
```

```typescript
// libs/ai/src/lib/provider-registry.ts — add one line
import { myProviderEntry } from "./providers/my-provider";

export const AI_PROVIDER_REGISTRY: Record<AiProvider, AIProviderEntry> = {
  // ...
  myProvider: myProviderEntry,
};
```

If the new fetch/URL is part of the public `@koloda/ai` surface, also re-export the provider module from `libs/ai/src/index.ts`.

### 5. Chat Streaming (`libs/ai/src/lib/chat-stream.ts`)

Add a thin wrapper that supplies the AI SDK model factory to shared `runChatStream`:

```typescript
export function streamChatWithMyProvider(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  { apiKey }: { apiKey: string },
) {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const myProvider = createOpenAICompatible({
      name: "my-provider",
      baseURL: "https://api.myprovider.com/v1",
      apiKey,
    });
    return runChatStream((modelId) => myProvider(modelId), "myProvider", request, onChunk, abortSignal);
  });
}
```

### 6. Card Generation (`libs/ai/src/lib/card-generation.ts`)

Add a thin wrapper that supplies the AI SDK model factory to shared `runCardGeneration`
(structured stream → parse stream text → plain `generateText` fallback):

```typescript
export function generateCardsWithMyProvider(
  request: CardGenerationRequest,
  { apiKey }: { apiKey: string },
) {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const myProvider = createOpenAICompatible({
      name: "my-provider",
      baseURL: "https://api.myprovider.com/v1",
      apiKey,
      supportsStructuredOutputs: true,
    });
    return runCardGeneration((modelId) => myProvider(modelId), "myProvider", request);
  });
}
```

### 7. UI Form Config (`libs/app-react/src/lib/settings/ai-providers/ai-provider-form-config.ts`)

The add and edit profile forms are generic.
`AddAIProfileForm` and `EditAIProfileForm` look up a declarative `AIProviderFormConfig` in `AI_PROVIDER_FORM_CONFIG`.
They render its `fields` via `AIProfileFormFields`.
Do not create per-provider form components — add one entry to the config record.

Most providers reuse a helper (extend the helper's provider union type if needed):

```typescript
// API-key-only provider:
myProvider: apiKeyOnlyConfig("myProvider", myProviderSecretsValidation),

// Base-URL provider (baseUrl required, API key optional):
myProvider: baseUrlConfig("myProvider", myProviderSecretsValidation, "https://api.myprovider.com/v1"),
```

The helpers require the secrets schema from step 1 to match their shape:
API key only, or baseUrl plus an optional API key.
Anything else needs a hand-written entry:

```typescript
myProvider: {
  fields: [
    { type: "title", isRequired: false, defaultValue: "" },
    { type: "apiKey", isRequired: true, defaultValue: "" },
  ],
  schema: myProviderSecretsValidation.extend({
    title: aiProfileValidation.shape.title,
  }),
  toSecrets: (values) => ({ provider: "myProvider", apiKey: values.apiKey ?? "" }),
  fromSecrets: (secrets) => ({
    apiKey: secrets?.provider === "myProvider" ? (secrets.apiKey ?? "") : "",
  }),
},
```

Field types are `title`, `baseUrl`, and `apiKey`.
`AIProfileFormFields` supplies the labels, placeholders, and edit-mode secret masking for these.
No new locale strings are needed.
If the provider needs a different field, extend `AIProfileFieldType`.
Teach `AIProfileFormFields` to render it, and add its label string.

### 8. Verify Dialog Wiring

There is no per-provider registration step.
`settings-ai-add-profile.tsx` passes the picker selection to the generic `AddAIProfileForm`.
The picker lists whatever the host store enables (see step 9).
`settings-ai-edit-profile.tsx` derives the provider from `profile.secrets?.provider` and renders `EditAIProfileForm`.
Both resolve the entry added in step 7.
Check that the add dialog renders the new fields and the edit dialog prefills them via `fromSecrets`.

### 9. Host enablement

Do not edit app stores. Desktop uses `AI_PROVIDERS`; demo uses `listProvidersThatWorkInBrowser()`.

Set `worksInBrowser: true` only if the provider’s HTTP API can be called from a browser page origin (CORS headers). Use `false` when it cannot — the provider stays in the catalog and Electron, and is listed but disabled in demo’s add-profile picker.

### 10. Add Tests

- `crates/koloda-core/tests/ai_tests.rs` - Rust unit tests
- `crates/koloda-core/tests/ai_integration_tests.rs` - Rust integration tests
- `crates/koloda-core/tests/settings_ai_tests.rs` - Settings validation tests
- `libs/ai/src/lib/card-generation.test.ts` - Card generation tests

## Key Files Reference

| Layer | File | Purpose |
|-------|------|---------|
| Catalog | `libs/ai/src/lib/provider-catalog.ts` | Provider labels, IDs, base URLs |
| Secrets | `libs/ai/src/lib/provider-secrets.ts` | Per-provider zod schemas, `AISecrets` |
| Rust Domain | `crates/koloda-core/src/domain/ai.rs` | Provider enum, validation |
| Rust Repo | `crates/koloda-core/src/repo/ai.rs` | Secret redaction/reconstruction |
| Registry | `libs/ai/src/lib/providers/<provider>.ts` + `provider-registry.ts` | Per-provider client/fetch; types + wiring table |
| Streaming | `libs/ai/src/lib/chat-stream.ts` | Chat stream implementation |
| Generation | `libs/ai/src/lib/card-generation.ts` | Card generation implementation |
| Form Config | `libs/app-react/src/lib/settings/ai-providers/ai-provider-form-config.ts` | Per-provider fields, schema, secrets mapping |
| Add Form | `libs/app-react/src/lib/settings/ai-providers/add-ai-profile-form.tsx` | Generic add form (renders the config) |
| Edit Form | `libs/app-react/src/lib/settings/ai-providers/edit-ai-profile-form.tsx` | Generic edit form (renders the config) |
| Settings | `libs/app-react/src/lib/settings/settings-ai-*-profile.tsx` | Add/edit dialogs (provider picker, wiring) |
| App Stores | `apps/*/src/app/store.ts` | Desktop: `AI_PROVIDERS`. Demo: `listProvidersThatWorkInBrowser()` |
