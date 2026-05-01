import { z } from "zod";

export const AI_PROVIDER_LABELS = {
  openrouter: "OpenRouter",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  codex: "Codex",
} as const;

export type AiProvider = keyof typeof AI_PROVIDER_LABELS;

export const AI_PROVIDERS = Object.keys(AI_PROVIDER_LABELS) as AiProvider[];

export const openRouterSecretsValidation = z.object({
  apiKey: z.string().min(1, "validation.settings-ai.providers.apiKey"),
});

export const ollamaSecretsValidation = z.object({
  baseUrl: z.url("validation.settings-ai.providers.baseUrl"),
});

export const lmstudioSecretsValidation = z.object({
  baseUrl: z.url("validation.settings-ai.providers.baseUrl"),
  apiKey: z.string().optional(),
});

export const codexSecretsValidation = z.object({});

export type AIPrompterSecrets =
  | z.infer<typeof openRouterSecretsValidation>
  | z.infer<typeof ollamaSecretsValidation>
  | z.infer<typeof lmstudioSecretsValidation>
  | z.infer<typeof codexSecretsValidation>;

const secretsValidation = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("openrouter"), ...openRouterSecretsValidation.shape }),
  z.object({ provider: z.literal("ollama"), ...ollamaSecretsValidation.shape }),
  z.object({ provider: z.literal("lmstudio"), ...lmstudioSecretsValidation.shape }),
  z.object({ provider: z.literal("codex") }),
]);

export type AISecrets = z.infer<typeof secretsValidation>;

export const aiProfileValidation = z.object({
  id: z.uuid(),
  title: z.string().max(128, "validation.common.title.too-long").optional(),
  secrets: secretsValidation.optional(),
  lastUsedModel: z.string().optional(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
});

export type AIProfile = z.input<typeof aiProfileValidation>;

export const aiSettingsValidation = z.object({
  profiles: z.array(aiProfileValidation),
});

export type AISettings = z.input<typeof aiSettingsValidation>;

export const DEFAULT_AI_SETTINGS: AISettings = aiSettingsValidation.parse({
  profiles: [],
});

export type AddAIProfileData = {
  title?: string;
  secrets?: AISecrets;
};

export type RemoveAIProfileData = {
  id: string;
};

export type UpdateAIProfileData = {
  id: string;
  title?: string;
  secrets?: AISecrets;
};

export type TouchAIProfileData = {
  id: string;
  modelId?: string;
};

export type SecretField = "apiKey" | "baseUrl";

export type AIModel = {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  top_provider?: {
    max_completion_tokens?: number;
  };
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string;
  };
  supported_parameters?: string[];
  supported_reasoning_levels?: Array<{ effort: string; description: string }>;
  default_reasoning_level?: string;
};

export type ModelParameter = {
  type: "reasoning_effort";
  value: string;
  levels: Array<{ effort: string; description: string }>;
};

export type StreamUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export const GENERATION_TEMPERATURE = 0.2;

export const DEFAULT_GENERATION_PROMPT_TEMPLATE = [
  "You are a flashcard generator that must produce strictly structured flashcard data.",
  "The flashcards have the following fields:",
  "{{fields}}",
  "",
  "Rules:",
  "{{rules}}",
  "",
  "{{provider}}",
].join("\n");

export const DEFAULT_CHAT_PROMPT_TEMPLATE = [
  "You are a helpful AI study assistant embedded in a flashcard app.",
  "You can answer questions, explain concepts, and have conversations.",
  "Keep responses concise, educational, and accurate.",
].join("\n");

export const generateCardsInputSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  reasoningEffort: z.string().optional(),
  deckId: z.int().positive(),
  templateId: z.int().positive(),
});

export type GenerateCardsInput = z.input<typeof generateCardsInputSchema>;

export type GeneratedCard = { content: Record<string, { text: string }> };

export type OnCardGenerated = (card: GeneratedCard) => void;

export type Message = { role: string; content: string };

export type CardGenerationFields = Array<{ id: number; title: string; isRequired: boolean; type?: string }>;

export type ChatStreamRequest = {
  messages: Message[];
  input: GenerateCardsInput;
  template?: { content: { fields: CardGenerationFields } };
  systemPromptTemplate?: string;
};

export type ChatStreamGenerator = (
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
) => Promise<StreamUsage | undefined>;

export type CardGenerationRequest = {
  template: { content: { fields: CardGenerationFields } };
  input: GenerateCardsInput;
  messages?: Message[];
  onCard: OnCardGenerated;
  abortSignal?: AbortSignal;
  systemPromptTemplate?: string;
};

export type GenerateCardsFunction = (request: CardGenerationRequest) => Promise<void>;
