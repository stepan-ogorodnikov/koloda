import { streamText } from "ai";
import { resolveGenerationTemperature } from "./card-parsing";
import { wrapAIError } from "./error";
import { compilePromptTemplate } from "./prompts";
import type { AISecrets, ChatStreamRequest, Message, StreamUsage } from "./types";
import { DEFAULT_CHAT_PROMPT_TEMPLATE, OPENCODE_GO_BASE_URL } from "./types";

export async function streamChatWithOpenRouter(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  { apiKey }: Extract<AISecrets, { provider: "openrouter" }>,
): Promise<StreamUsage | undefined> {
  return wrapAIError(async () => {
    const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
    const openrouter = createOpenRouter({ apiKey });
    let streamedError: unknown = null;
    const result = streamText({
      model: openrouter(request.input.modelId),
      temperature: resolveGenerationTemperature(request.input.temperature),
      system: compilePromptTemplate(
        request.systemPromptTemplate ?? DEFAULT_CHAT_PROMPT_TEMPLATE,
        request.template?.content.fields ?? [],
        "openrouter",
        "chat",
      ),
      messages: request.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      abortSignal,
      onError: ({ error }) => {
        streamedError = error;
      },
    });

    try {
      for await (const chunk of result.textStream) {
        onChunk(chunk);
      }
    } catch (error) {
      throw streamedError ?? error;
    }

    if (streamedError) throw streamedError;

    const usage = await result.usage;
    if (usage.inputTokens == null && usage.outputTokens == null) return undefined;

    return {
      promptTokens: usage.inputTokens ?? 0,
      completionTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    };
  });
}

export async function streamChatWithOllama(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  { baseUrl, apiKey }: Extract<AISecrets, { provider: "ollama" }>,
): Promise<StreamUsage | undefined> {
  const { createOllama } = await import("ai-sdk-ollama");
  const ollama = createOllama({ baseURL: baseUrl, ...(apiKey ? { apiKey: apiKey } : {}) });

  return wrapAIError(async () => {
    let streamedError: unknown = null;
    const result = streamText({
      model: ollama(request.input.modelId),
      temperature: resolveGenerationTemperature(request.input.temperature),
      system: compilePromptTemplate(
        request.systemPromptTemplate ?? DEFAULT_CHAT_PROMPT_TEMPLATE,
        request.template?.content.fields ?? [],
        "ollama",
        "chat",
      ),
      messages: request.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      abortSignal,
      onError: ({ error }) => {
        streamedError = error;
      },
    });

    try {
      for await (const chunk of result.textStream) {
        onChunk(chunk);
      }
    } catch (error) {
      throw streamedError ?? error;
    }

    if (streamedError) throw streamedError;

    const usage = await result.usage;
    if (usage.inputTokens == null && usage.outputTokens == null) return undefined;

    return {
      promptTokens: usage.inputTokens ?? 0,
      completionTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    };
  });
}

export async function streamChatWithLMStudio(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  { baseUrl, apiKey }: Extract<AISecrets, { provider: "lmstudio" }>,
): Promise<StreamUsage | undefined> {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const lmstudio = createOpenAICompatible({ name: "lmstudio", baseURL: baseUrl, apiKey });
    let streamedError: unknown = null;

    const result = streamText({
      model: lmstudio(request.input.modelId),
      temperature: resolveGenerationTemperature(request.input.temperature),
      system: compilePromptTemplate(
        request.systemPromptTemplate ?? DEFAULT_CHAT_PROMPT_TEMPLATE,
        request.template?.content.fields ?? [],
        "lmstudio",
        "chat",
      ),
      messages: request.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      abortSignal,
      onError: ({ error }) => {
        streamedError = error;
      },
    });

    try {
      for await (const chunk of result.textStream) {
        onChunk(chunk);
      }
    } catch (error) {
      throw streamedError ?? error;
    }

    if (streamedError) throw streamedError;

    const usage = await result.usage;
    if (usage.inputTokens == null && usage.outputTokens == null) return undefined;

    return {
      promptTokens: usage.inputTokens ?? 0,
      completionTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    };
  });
}

export async function streamChatWithOpencodeGo(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  { apiKey }: Extract<AISecrets, { provider: "opencodeGo" }>,
): Promise<StreamUsage | undefined> {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const opencodeGo = createOpenAICompatible({ name: "opencode-go", baseURL: OPENCODE_GO_BASE_URL, apiKey });
    let streamedError: unknown = null;

    const result = streamText({
      model: opencodeGo(request.input.modelId),
      temperature: resolveGenerationTemperature(request.input.temperature),
      system: compilePromptTemplate(
        request.systemPromptTemplate ?? DEFAULT_CHAT_PROMPT_TEMPLATE,
        request.template?.content.fields ?? [],
        "opencodeGo",
        "chat",
      ),
      messages: request.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      abortSignal,
      providerOptions: request.input.reasoningEffort
        ? { "opencode-go": { reasoningEffort: request.input.reasoningEffort } }
        : undefined,
      onError: ({ error }) => {
        streamedError = error;
      },
    });

    try {
      for await (const chunk of result.textStream) {
        onChunk(chunk);
      }
    } catch (error) {
      throw streamedError ?? error;
    }

    if (streamedError) throw streamedError;

    const usage = await result.usage;
    if (usage.inputTokens == null && usage.outputTokens == null) return undefined;

    return {
      promptTokens: usage.inputTokens ?? 0,
      completionTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    };
  });
}

export function getConversationMessages(messages: Message[], prompt: string): Message[] {
  return [...messages, { role: "user", content: prompt }];
}
