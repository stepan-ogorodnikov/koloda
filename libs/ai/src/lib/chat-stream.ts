import { streamText } from "ai";
import { resolveGenerationTemperature } from "./card-parsing";
import { AIError, throwForAIResponse, wrapAIError } from "./error";
import { compilePromptTemplate } from "./prompts";
import type { AiProvider, AISecrets, ChatStreamRequest, Message, StreamUsage } from "./types";
import { DEFAULT_CHAT_PROMPT_TEMPLATE, OPENCODE_GO_BASE_URL } from "./types";

async function runOpenAICompatibleChatStream(
  baseUrl: string,
  apiKey: string | undefined,
  provider: Extract<AiProvider, "lmstudio">,
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
): Promise<StreamUsage | undefined> {
  const endpoint = new URL("/v1/chat/completions", baseUrl);
  return wrapAIError(async () => {
    const systemMessage = compilePromptTemplate(
      request.systemPromptTemplate ?? DEFAULT_CHAT_PROMPT_TEMPLATE,
      request.template?.content.fields ?? [],
      provider,
      "chat",
    );
    const messages = systemMessage
      ? [
        { role: "system", content: systemMessage },
        ...request.messages.map((m) => ({ role: m.role, content: m.content })),
      ]
      : request.messages.map((m) => ({ role: m.role, content: m.content }));

    const response = throwForAIResponse(
      await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
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

export async function streamChatWithOpenRouter(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  secrets: Extract<AISecrets, { provider: "openrouter" }>,
): Promise<StreamUsage | undefined> {
  return wrapAIError(async () => {
    const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
    const openrouter = createOpenRouter({ apiKey: secrets.apiKey });
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
  baseUrl: string,
): Promise<StreamUsage | undefined> {
  return wrapAIError(async () => {
    const response = throwForAIResponse(
      await fetch(new URL("/api/chat", baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: request.input.modelId,
          system: compilePromptTemplate(
            request.systemPromptTemplate ?? DEFAULT_CHAT_PROMPT_TEMPLATE,
            request.template?.content.fields ?? [],
            "ollama",
            "chat",
          ),
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
          options: { temperature: resolveGenerationTemperature(request.input.temperature) },
          stream: true,
        }),
        signal: abortSignal,
      }),
    );

    return await readOllamaChatStream(response, onChunk);
  });
}

export async function streamChatWithLMStudio(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  secrets: Extract<AISecrets, { provider: "lmstudio" }>,
): Promise<StreamUsage | undefined> {
  return runOpenAICompatibleChatStream(secrets.baseUrl, secrets.apiKey, "lmstudio", request, onChunk, abortSignal);
}

export async function streamChatWithOpencodeGo(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  secrets: Extract<AISecrets, { provider: "opencodeGo" }>,
): Promise<StreamUsage | undefined> {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const opencodeGo = createOpenAICompatible({
      name: "opencode-go",
      baseURL: OPENCODE_GO_BASE_URL,
      apiKey: secrets.apiKey,
    });
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

async function readOllamaChatStream(
  response: Response,
  onChunk: (chunk: string) => void,
): Promise<StreamUsage | undefined> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIError("ai.invalid-response");

  const decoder = new TextDecoder();
  let buffer = "";
  let usage: StreamUsage | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
            prompt_eval_count?: number;
            eval_count?: number;
          };
          const content = data.message?.content;
          if (typeof content === "string") onChunk(content);

          if (data.done) {
            const promptTokens = data.prompt_eval_count;
            const completionTokens = data.eval_count;
            if (promptTokens != null || completionTokens != null) {
              usage = {
                promptTokens: promptTokens ?? 0,
                completionTokens: completionTokens ?? 0,
                totalTokens: (promptTokens ?? 0) + (completionTokens ?? 0),
              };
            }
          }
        } catch {
          // Ignore parse errors for malformed lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return usage;
}

async function readOpenAICompatibleChatStream(
  response: Response,
  onChunk: (chunk: string) => void,
): Promise<StreamUsage | undefined> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIError("ai.invalid-response");

  const decoder = new TextDecoder();
  let buffer = "";
  let usage: StreamUsage | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };
          const content = parsed.choices?.[0]?.delta?.content;
          if (typeof content === "string") onChunk(content);

          if (parsed.usage) {
            const u = parsed.usage;
            usage = {
              promptTokens: u.prompt_tokens ?? 0,
              completionTokens: u.completion_tokens ?? 0,
              totalTokens: u.total_tokens ?? 0,
            };
          }
        } catch {
          // Ignore parse errors for malformed lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return usage;
}
