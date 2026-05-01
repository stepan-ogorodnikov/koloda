import {
  generateCardsWithLMStudio,
  generateCardsWithOllama,
  generateCardsWithOpenRouter,
  streamChatWithLMStudio,
  streamChatWithOllama,
  streamChatWithOpenRouter,
} from "./card-generation";
import { AIError, throwForAIResponse } from "./error";
import type { AIModel, AiProvider, AISecrets, ChatStreamGenerator, GenerateCardsFunction, SecretField } from "./types";

export type AIGenerationClient = {
  provider: AISecrets["provider"];
  listModels: () => Promise<AIModel[]>;
  chat: ChatStreamGenerator;
  generateCards: GenerateCardsFunction;
};

type OpenRouterModelsResponse = { data: AIModel[] };

type OpenAICompatibleModelsResponse = {
  data: Array<{ id: string }>;
};

type OllamaModelsResponse = {
  models?: Array<{
    model: string;
    name?: string;
  }>;
};

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export async function fetchOpenRouterModels(): Promise<AIModel[]> {
  const response = throwForAIResponse(
    await fetch(OPENROUTER_MODELS_URL, {
      headers: { "Content-Type": "application/json" },
    }),
  );

  const data: OpenRouterModelsResponse = await response.json();
  if (!Array.isArray(data.data)) throw new AIError("ai.invalid-response");

  return data.data
    .filter((model) => model.id.includes("/"))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchOpenAICompatibleModels(baseUrl: string, apiKey?: string): Promise<AIModel[]> {
  const response = throwForAIResponse(
    await fetch(new URL("/v1/models", baseUrl), {
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    }),
  );

  const data: OpenAICompatibleModelsResponse = await response.json();
  if (!Array.isArray(data.data)) throw new AIError("ai.invalid-response");

  return data.data
    .map((model) => ({
      id: model.id,
      name: model.id,
      context_length: 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchOllamaModels(baseUrl: string): Promise<AIModel[]> {
  const response = throwForAIResponse(
    await fetch(new URL("/api/tags", baseUrl), {
      headers: { "Content-Type": "application/json" },
    }),
  );

  const data: OllamaModelsResponse = await response.json();
  if (!Array.isArray(data.models)) throw new AIError("ai.invalid-response");

  return data.models
    .map((model) => ({
      id: model.model,
      name: model.name ?? model.model,
      context_length: 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchCodexModels(): Promise<AIModel[]> {
  throw new AIError("unknown", "Codex provider requires the native app runtime to list models.");
}

export type AIProviderEntry = {
  id: AiProvider;
  createClient: (secrets: AISecrets) => AIGenerationClient;
  fetchModels: (secrets: AISecrets) => Promise<AIModel[]>;
  getMissingSecretFields: (secrets: AISecrets) => SecretField[];
  getApiKey: (secrets: AISecrets) => string | null;
  requiresNativeRuntime: boolean;
};

function createOpenRouterClient(secrets: Extract<AISecrets, { provider: "openrouter" }>): AIGenerationClient {
  return {
    provider: "openrouter",
    listModels: fetchOpenRouterModels,
    chat: (request, onChunk, abortSignal) => streamChatWithOpenRouter(request, onChunk, abortSignal, secrets),
    generateCards: (request) => generateCardsWithOpenRouter(request, secrets),
  };
}

function createOllamaClient(secrets: Extract<AISecrets, { provider: "ollama" }>): AIGenerationClient {
  return {
    provider: "ollama",
    listModels: () => fetchOllamaModels(secrets.baseUrl),
    chat: (request, onChunk, abortSignal) => streamChatWithOllama(request, onChunk, abortSignal, secrets.baseUrl),
    generateCards: (request) => generateCardsWithOllama(request, secrets.baseUrl),
  };
}

function createLmStudioClient(secrets: Extract<AISecrets, { provider: "lmstudio" }>): AIGenerationClient {
  return {
    provider: "lmstudio",
    listModels: () => fetchOpenAICompatibleModels(secrets.baseUrl, secrets.apiKey),
    chat: (request, onChunk, abortSignal) => streamChatWithLMStudio(request, onChunk, abortSignal, secrets),
    generateCards: (request) => generateCardsWithLMStudio(request, secrets),
  };
}

function createCodexPlaceholderClient(): AIGenerationClient {
  const unsupported = async () => {
    throw new AIError("unknown", "Codex provider requires the native app runtime.");
  };

  return {
    provider: "codex",
    listModels: fetchCodexModels,
    chat: unsupported,
    generateCards: unsupported,
  };
}

export const AI_PROVIDER_REGISTRY: Record<AiProvider, AIProviderEntry> = {
  openrouter: {
    id: "openrouter",
    createClient: (secrets) => createOpenRouterClient(secrets as Extract<AISecrets, { provider: "openrouter" }>),
    fetchModels: () => fetchOpenRouterModels(),
    getMissingSecretFields: (secrets) => {
      const s = secrets as Extract<AISecrets, { provider: "openrouter" }>;
      return s.apiKey ? [] : ["apiKey"];
    },
    getApiKey: (secrets) => (secrets as Extract<AISecrets, { provider: "openrouter" }>).apiKey,
    requiresNativeRuntime: false,
  },
  ollama: {
    id: "ollama",
    createClient: (secrets) => createOllamaClient(secrets as Extract<AISecrets, { provider: "ollama" }>),
    fetchModels: (secrets) => fetchOllamaModels((secrets as Extract<AISecrets, { provider: "ollama" }>).baseUrl),
    getMissingSecretFields: (secrets) => {
      const s = secrets as Extract<AISecrets, { provider: "ollama" }>;
      return s.baseUrl ? [] : ["baseUrl"];
    },
    getApiKey: () => null,
    requiresNativeRuntime: false,
  },
  lmstudio: {
    id: "lmstudio",
    createClient: (secrets) => createLmStudioClient(secrets as Extract<AISecrets, { provider: "lmstudio" }>),
    fetchModels: (secrets) => {
      const s = secrets as Extract<AISecrets, { provider: "lmstudio" }>;
      return fetchOpenAICompatibleModels(s.baseUrl, s.apiKey);
    },
    getMissingSecretFields: (secrets) => {
      const s = secrets as Extract<AISecrets, { provider: "lmstudio" }>;
      return s.baseUrl ? [] : ["baseUrl"];
    },
    getApiKey: (secrets) => (secrets as Extract<AISecrets, { provider: "lmstudio" }>).apiKey ?? null,
    requiresNativeRuntime: false,
  },
  codex: {
    id: "codex",
    createClient: () => createCodexPlaceholderClient(),
    fetchModels: () => fetchCodexModels(),
    getMissingSecretFields: () => [],
    getApiKey: () => null,
    requiresNativeRuntime: true,
  },
};

export function getProviderConfig(provider: AiProvider): AIProviderEntry {
  const entry = AI_PROVIDER_REGISTRY[provider];
  if (!entry) throw new AIError("unknown", `Unsupported provider: ${provider}`);
  return entry;
}

export function createAIGenerationClient(secretsInput: AISecrets | string): AIGenerationClient {
  const secrets: AISecrets = typeof secretsInput === "string"
    ? ({ provider: "openrouter", apiKey: secretsInput } as const)
    : secretsInput;

  return getProviderConfig(secrets.provider).createClient(secrets);
}

export async function fetchModels(secrets?: AISecrets | null): Promise<AIModel[]> {
  if (!secrets) return fetchOpenRouterModels();
  return getProviderConfig(secrets.provider).fetchModels(secrets);
}
