import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { streamText } from "ai";
import { resolveGenerationTemperature } from "./card-parsing";
import { wrapAIError } from "./error";
import type { ChatStreamRequest, Message } from "./generation";
import type { StreamUsage } from "./models";
import { compilePromptTemplate } from "./prompts";
import { DEFAULT_CHAT_PROMPT_TEMPLATE } from "./prompts";
import type { AiProvider } from "./provider-catalog";
import { OPENCODE_GO_BASE_URL, OPENCODE_ZEN_BASE_URL } from "./provider-catalog";
import { wrapModelWithReasoningExtraction } from "./model-reasoning-extraction";

async function runChatStream(
  modelFactory: (modelId: string) => Parameters<typeof wrapModelWithReasoningExtraction>[0],
  providerLabel: AiProvider,
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  providerOptions?: ProviderOptions,
): Promise<StreamUsage | undefined> {
  let streamedError: unknown = null;
  const result = streamText({
    model: wrapModelWithReasoningExtraction(modelFactory(request.input.modelId)),

    temperature: resolveGenerationTemperature(request.input.temperature),
    system: compilePromptTemplate(
      request.systemPromptTemplate ?? DEFAULT_CHAT_PROMPT_TEMPLATE,
      request.template?.content.fields ?? [],
      providerLabel,
      "chat",
    ),
    messages: request.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    abortSignal,
    ...(providerOptions ? { providerOptions } : {}),
    onError: ({ error }) => {
      streamedError = error;
    },
  });

  try {
    for await (const chunk of result.textStream) {
      onChunk(chunk);
    }
  } catch (error) {
    // WHY: The Vercel AI SDK's for-await loop can swallow the actual API error.
    // Prefer the onError payload when present — it has better details.
    throw streamedError ?? error;
  }

  // WHY: onError may fire without the for-await loop throwing; rethrow so callers still see the failure.
  if (streamedError) throw streamedError;

  const usage = await result.usage;
  if (usage.inputTokens == null && usage.outputTokens == null) return undefined;

  return {
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}

/*
 * Provider-specific chat streaming
 */

export function streamChatWithOpenRouter(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  { apiKey }: { apiKey: string },
) {
  return wrapAIError(async () => {
    const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
    const openrouter = createOpenRouter({ apiKey });
    return runChatStream((modelId) => openrouter(modelId), "openrouter", request, onChunk, abortSignal);
  });
}

export function streamChatWithOllama(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  { baseUrl, apiKey }: { baseUrl: string; apiKey?: string },
) {
  return wrapAIError(async () => {
    const { createOllama } = await import("ai-sdk-ollama");
    const ollama = createOllama({ baseURL: baseUrl, ...(apiKey ? { apiKey } : {}) });
    return runChatStream((modelId) => ollama(modelId), "ollama", request, onChunk, abortSignal);
  });
}

export function streamChatWithLMStudio(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  { baseUrl, apiKey }: { baseUrl: string; apiKey?: string },
) {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const lmstudio = createOpenAICompatible({ name: "lmstudio", baseURL: baseUrl, apiKey });
    return runChatStream((modelId) => lmstudio(modelId), "lmstudio", request, onChunk, abortSignal);
  });
}

export function streamChatWithOpencodeGo(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  { apiKey }: { apiKey: string },
) {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const opencodeGo = createOpenAICompatible({ name: "opencode-go", baseURL: OPENCODE_GO_BASE_URL, apiKey });
    const providerOptions = request.input.reasoningEffort
      ? { "opencode-go": { reasoningEffort: request.input.reasoningEffort } }
      : undefined;
    return runChatStream(
      (modelId) => opencodeGo(modelId),
      "opencodeGo",
      request,
      onChunk,
      abortSignal,
      providerOptions,
    );
  });
}

export function streamChatWithOpencodeZen(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  { apiKey }: { apiKey: string },
) {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const opencodeZen = createOpenAICompatible({ name: "opencode-zen", baseURL: OPENCODE_ZEN_BASE_URL, apiKey });
    const providerOptions = request.input.reasoningEffort
      ? { "opencode-zen": { reasoningEffort: request.input.reasoningEffort } }
      : undefined;
    return runChatStream(
      (modelId) => opencodeZen(modelId),
      "opencodeZen",
      request,
      onChunk,
      abortSignal,
      providerOptions,
    );
  });
}

export function getConversationMessages(messages: Message[], prompt: string): Message[] {
  return [...messages, { role: "user", content: prompt }];
}
