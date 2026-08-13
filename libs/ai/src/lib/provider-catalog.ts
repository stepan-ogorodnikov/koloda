export const AI_PROVIDER_LABELS = {
  openrouter: "OpenRouter",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  opencodeGo: "OpenCode Go",
  opencodeZen: "OpenCode Zen",
  ollamaCloud: "Ollama Cloud",
} as const;

export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
export const OPENCODE_ZEN_BASE_URL = "https://opencode.ai/zen/v1";
export const OLLAMA_CLOUD_BASE_URL = "https://ollama.com";

export type AiProvider = keyof typeof AI_PROVIDER_LABELS;

export const AI_PROVIDERS = Object.keys(AI_PROVIDER_LABELS) as AiProvider[];
