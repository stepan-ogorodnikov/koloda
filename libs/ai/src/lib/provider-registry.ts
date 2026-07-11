import { AIError } from "./error";
import type { ChatStreamGenerator, GenerateCardsFunction } from "./generation";
import type { AIModel } from "./models";
import type { AiProvider } from "./provider-catalog";
import type { AISecrets, SecretField } from "./provider-secrets";
import { codexProviderEntry } from "./providers/codex";
import { lmstudioProviderEntry } from "./providers/lmstudio";
import { ollamaProviderEntry } from "./providers/ollama";
import { opencodeGoProviderEntry } from "./providers/opencode-go";
import { opencodeZenProviderEntry } from "./providers/opencode-zen";
import { fetchOpenRouterModels, openrouterProviderEntry } from "./providers/openrouter";

export type AIGenerationClient = {
  provider: AISecrets["provider"];
  listModels: () => Promise<AIModel[]>;
  chat: ChatStreamGenerator;
  generateCards: GenerateCardsFunction;
};

export type ProviderImplementation = {
  createClient: (secrets: AISecrets) => AIGenerationClient;
  fetchModels: (secrets: AISecrets) => Promise<AIModel[]>;
};

export type AIProviderEntry = {
  id: AiProvider;
  createClient: (secrets: AISecrets) => AIGenerationClient;
  fetchModels: (secrets: AISecrets) => Promise<AIModel[]>;
  getMissingSecretFields: (secrets: AISecrets) => SecretField[];
  getApiKey: (secrets: AISecrets) => string | null;
};

const providerImplementations = new Map<AiProvider, ProviderImplementation>();

export function registerProviderImplementation(provider: AiProvider, implementation: ProviderImplementation) {
  providerImplementations.set(provider, implementation);
}

export const AI_PROVIDER_REGISTRY: Record<AiProvider, AIProviderEntry> = {
  openrouter: openrouterProviderEntry,
  ollama: ollamaProviderEntry,
  lmstudio: lmstudioProviderEntry,
  opencodeGo: opencodeGoProviderEntry,
  opencodeZen: opencodeZenProviderEntry,
  codex: codexProviderEntry,
};

export function getProviderConfig(provider: AiProvider): AIProviderEntry {
  const entry = AI_PROVIDER_REGISTRY[provider];
  if (!entry) throw new AIError("unknown", `Unsupported provider: ${provider}`);

  return entry;
}

function resolveProviderImplementation(provider: AiProvider): ProviderImplementation {
  const override = providerImplementations.get(provider);
  if (override) return override;
  const entry = AI_PROVIDER_REGISTRY[provider];

  return {
    createClient: (secrets) => entry.createClient(secrets),
    fetchModels: (secrets) => entry.fetchModels(secrets),
  };
}

export function createAIGenerationClient(secretsInput: AISecrets | string): AIGenerationClient {
  const secrets: AISecrets = typeof secretsInput === "string"
    ? ({ provider: "openrouter", apiKey: secretsInput } as const)
    : secretsInput;

  return resolveProviderImplementation(secrets.provider).createClient(secrets);
}

export async function fetchModels(secrets?: AISecrets | null): Promise<AIModel[]> {
  if (!secrets) return fetchOpenRouterModels();
  return resolveProviderImplementation(secrets.provider).fetchModels(secrets);
}
