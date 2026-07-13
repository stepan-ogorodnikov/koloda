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
export const myProviderSecretsValidation = z.object({
  apiKey: z.string().min(1, "validation.settings-ai.providers.apiKey"),
  // Optional fields:
  // baseUrl: z.string().url().optional(),
});

// Add to AIPrompterSecrets union
export type AIPrompterSecrets =
  // ...
  | z.infer<typeof myProviderSecretsValidation>;

// Add to aiSecretsValidation discriminated union
export const aiSecretsValidation = z.discriminatedUnion("provider", [
  // ...
  z.object({ provider: z.literal("myProvider"), ...myProviderSecretsValidation.shape }),
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
    #[serde(rename = "apiKey", alias = "api_key")]
    api_key: String,
    // Optional: #[serde(rename = "baseUrl", skip_serializing_if = "Option::is_none")]
    // base_url: Option<String>,
},

// Add to provider() method
AISecrets::MyProvider { .. } => "myProvider",

// Add to api_key() method
AISecrets::MyProvider { api_key } => Some(api_key),

// Add validation in validate() method
AISecrets::MyProvider { api_key } => {
    if api_key.trim().is_empty() {
        return Err(AppError::new(
            error_codes::VALIDATION_AI_PROVIDERS_PROVIDER,
            Some("myProvider.apiKey is required".to_string()),
        ));
    }
}

// Add whitespace validation in validate_not_whitespace_only() method
AISecrets::MyProvider { api_key } => {
    if !api_key.is_empty() && api_key.trim().is_empty() {
        return Err(AppError::new(
            error_codes::VALIDATION_AI_PROVIDERS_PROVIDER,
            Some("myProvider.apiKey cannot be whitespace only".to_string()),
        ));
    }
}
```

### 3. Rust Repository (`crates/koloda-core/src/repo/ai.rs`)

Add redaction and reconstruction for secrets:

```rust
// Add to redact_secrets()
AISecrets::MyProvider { .. } => AISecrets::MyProvider { api_key: String::new() },

// Add to reconstruct_secrets()
AISecrets::MyProvider { .. } => AISecrets::MyProvider { api_key },
```

### 4. Provider module (`libs/ai/src/lib/providers/`)

Add one file per provider (e.g. `my-provider.ts`) that owns fetchModels, createClient, and the `AIProviderEntry`. Types (`AIGenerationClient`, `AIProviderEntry`) live in `provider-registry.ts`. Then wire the entry there. Reuse `openai-compatible.ts` helpers when the models API is OpenAI-compatible.

```typescript
// libs/ai/src/lib/providers/my-provider.ts
import { generateCardsWithMyProvider } from "../card-generation";
import { streamChatWithMyProvider } from "../chat-stream";
import { AIError, throwForAIResponse } from "../error";
import type { AIGenerationClient, AIProviderEntry } from "../provider-registry";
import type { AIModel, AISecrets } from "../types";

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
  return {
    provider: "myProvider",
    listModels: () => fetchMyProviderModels(secrets.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithMyProvider(request, onChunk, abortSignal, secrets),
    generateCards: (request) => generateCardsWithMyProvider(request, secrets),
  };
}

export const myProviderEntry: AIProviderEntry = {
  id: "myProvider",
  createClient: (secrets) => createMyProviderClient(secrets as Extract<AISecrets, { provider: "myProvider" }>),
  fetchModels: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "myProvider" }>;
    return fetchMyProviderModels(s.apiKey);
  },
  getMissingSecretFields: (secrets) => {
    const s = secrets as Extract<AISecrets, { provider: "myProvider" }>;
    return s.apiKey ? [] : ["apiKey"];
  },
  getApiKey: (secrets) => (secrets as Extract<AISecrets, { provider: "myProvider" }>).apiKey,
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

Add streaming function for chat:

```typescript
export async function streamChatWithMyProvider(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  secrets: Extract<AISecrets, { provider: "myProvider" }>,
): Promise<StreamUsage | undefined> {
  return wrapAIError(async () => {
    const systemMessage = compilePromptTemplate(
      request.systemPromptTemplate ?? DEFAULT_CHAT_PROMPT_TEMPLATE,
      request.template?.content.fields ?? [],
      "myProvider",
      "chat",
    );
    const messages = systemMessage
      ? [
          { role: "system", content: systemMessage },
          ...request.messages.map((m) => ({ role: m.role, content: m.content })),
        ]
      : request.messages.map((m) => ({ role: m.role, content: m.content }));

    const response = throwForAIResponse(
      await fetch("https://api.myprovider.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secrets.apiKey}`,
        },
        body: JSON.stringify({
          model: request.input.modelId,
          temperature: resolveGenerationTemperature(request.input.temperature),
          messages,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: abortSignal,
      }),
    );

    return await readOpenAICompatibleChatStream(response, onChunk);
  });
}
```

### 6. Card Generation (`libs/ai/src/lib/card-generation.ts`)

Add generation function:

```typescript
export function generateCardsWithMyProvider(
  request: CardGenerationRequest,
  secrets: Extract<AISecrets, { provider: "myProvider" }>,
) {
  return wrapAIError(() =>
    runTextCompletionCardGeneration(async ({ template, input, messages, abortSignal, systemPromptTemplate }) => {
      const temperature = resolveGenerationTemperature(input.temperature);
      const response = throwForAIResponse(
        await fetch("https://api.myprovider.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secrets.apiKey}`,
          },
          body: JSON.stringify({
            model: input.modelId,
            temperature,
            messages: getTextCompletionMessages({
              fields: template.content.fields,
              prompt: input.prompt,
              messages,
              provider: "myProvider",
              systemPromptTemplate,
            }),
          }),
          signal: abortSignal,
        }),
      );

      const data = await response.json() as OpenAICompatibleChatCompletionsResponse;
      const content = data.choices?.[0]?.message?.content;
      if (content == null) throw new AIError("ai.invalid-response");
      return content;
    }, request)
  );
}
```

### 7. UI Forms (`libs/app-react/src/lib/settings/ai-providers/`)

Create add and edit form components:

**add-ai-profile-my-provider.tsx**:
```tsx
import { aiProfileValidation, myProviderSecretsValidation } from "@koloda/ai";
import type { AddAIProfileFormProps } from "./ai-profile-form-props";
import type { ZodIssue } from "@koloda/app";
import { toFormErrors } from "@koloda/app";
import { Button, Dialog, Label, TextField, useAppForm } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { z } from "zod";

const formSchema = myProviderSecretsValidation.extend({
  title: aiProfileValidation.shape.title,
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
  title: "",
  apiKey: "",
};

export function AddAIProfileMyProvider({ onSubmit, isPending, error }: AddAIProfileFormProps) {
  const { _ } = useLingui();

  const form = useAppForm({
    defaultValues,
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      onSubmit({
        title: value.title || undefined,
        secrets: { provider: "myProvider", apiKey: value.apiKey },
      });
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }}>
      <Dialog.Content variants={{ class: "flex flex-col gap-4" }}>
        <form.Field name="title">
          {(field) => (
            <TextField value={field.state.value} onBlur={field.handleBlur} onChange={field.handleChange}>
              <Label>{_(msg`settings.ai.profiles.title.label`)}</Label>
              <TextField.Input placeholder={_(msg`settings.ai.profiles.title.placeholder`)} />
              {!field.state.meta.isValid && <TextField.Errors errors={field.state.meta.errors as ZodIssue[]} />}
            </TextField>
          )}
        </form.Field>
        <form.Field name="apiKey">
          {(field) => (
            <TextField type="password" value={field.state.value} onBlur={field.handleBlur} onChange={field.handleChange} isRequired>
              <Label>{_(msg`settings.ai.profiles.api-key.label`)}</Label>
              <TextField.Input />
              {!field.state.meta.isValid && <TextField.Errors errors={field.state.meta.errors as ZodIssue[]} />}
            </TextField>
          )}
        </form.Field>
        {error && <form.Errors errors={toFormErrors(error)} />}
      </Dialog.Content>
      <Dialog.Footer>
        <div className="grow" />
        <form.Subscribe selector={(state) => [state.canSubmit]}>
          {([canSubmit]) => (
            <Button variants={{ style: "primary" }} type="submit" isDisabled={!canSubmit || isPending}>
              {_(msg`settings.ai.add.submit`)}
            </Button>
          )}
        </form.Subscribe>
      </Dialog.Footer>
    </form>
  );
}
```

**edit-ai-profile-my-provider.tsx** follows the same pattern but uses `EditAIProfileFormProps` and `AIProfileSecretsField`.

### 8. Register UI Forms

**`libs/app-react/src/lib/settings/settings-ai-add-profile.tsx`**:
```typescript
import { AddAIProfileMyProvider } from "./ai-providers/add-ai-profile-my-provider";

const PROVIDER_FORMS: Record<AiProvider, ComponentType<AddAIProfileFormProps>> = {
  // ...
  myProvider: AddAIProfileMyProvider,
};
```

**`libs/app-react/src/lib/settings/settings-ai-edit-profile.tsx`**:
```typescript
import { EditAIProfileMyProvider } from "./ai-providers/edit-ai-profile-my-provider";

const PROVIDER_FORMS: Record<AiProvider, ComponentType<EditAIProfileFormProps>> = {
  // ...
  myProvider: EditAIProfileMyProvider,
};
```

### 9. Register in App Stores

Add provider to all app stores:

- `apps/demo/src/app/store.ts`
- `apps/native-electron-react/src/app/store.ts`

```typescript
store.set(aiProvidersAtom, ["openrouter", "ollama", "lmstudio", "myProvider"]);
```

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
| Add Form | `libs/app-react/src/lib/settings/ai-providers/add-ai-profile-*.tsx` | Add profile UI |
| Edit Form | `libs/app-react/src/lib/settings/ai-providers/edit-ai-profile-*.tsx` | Edit profile UI |
| Settings | `libs/app-react/src/lib/settings/settings-ai-*-profile.tsx` | Form registration |
| App Stores | `apps/*/src/app/store.ts` | Provider enablement |
