import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { stepCountIs, streamText } from "ai";
import { bindAssistantTools } from "./assistant-tools";
import { resolveGenerationTemperature } from "./card-parsing";
import { AIError, wrapAIError } from "./error";
import type { ChatStreamChunk, ChatStreamRequest } from "./generation";
import type { StreamUsage } from "./models";
import { DEFAULT_CHAT_PROMPT_TEMPLATE } from "./prompts";
import { OLLAMA_CLOUD_BASE_URL, OPENCODE_GO_BASE_URL, OPENCODE_ZEN_BASE_URL } from "./provider-catalog";
import { wrapModelWithReasoningExtraction } from "./model-reasoning-extraction";

// WHY: bounds runaway tool loops (the model re-calling tools instead of answering)
// while leaving room for list_decks → get_deck_cards → answer chains plus retries.
const CHAT_TOOL_STEP_BUDGET = 8;

async function runChatStream(
  modelFactory: (modelId: string) => Parameters<typeof wrapModelWithReasoningExtraction>[0],
  request: ChatStreamRequest,
  onChunk: (chunk: ChatStreamChunk) => void,
  abortSignal: AbortSignal,
  providerOptions?: ProviderOptions,
): Promise<StreamUsage | undefined> {
  let streamedError: unknown = null;
  let wasAborted = false;
  const { executeTool, onToolEvent } = request;
  const toolNames = request.tools ?? [];
  // WHY: names without an executor mean a mis-wired host; fail fast instead of letting
  // the SDK surface "tool has no execute" mid-stream.
  if (toolNames.length > 0 && executeTool == null) {
    throw new AIError("unknown", "Chat request lists tools without an executor");
  }
  const tools =
    executeTool != null && toolNames.length > 0
      ? bindAssistantTools({ names: toolNames, execute: executeTool })
      : undefined;
  const result = streamText({
    model: wrapModelWithReasoningExtraction(modelFactory(request.input.modelId)),

    temperature: resolveGenerationTemperature(request.input.temperature),
    // WHY: empty custom prompts are allowed; trim so whitespace-only is sent empty.
    system: (request.systemPromptTemplate ?? DEFAULT_CHAT_PROMPT_TEMPLATE).trim(),
    messages: request.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    abortSignal,
    // WHY: multi-step only exists for tool runs; stopWhen keeps them bounded. Without
    // tools there is exactly one step and the extra options would be dead weight.
    ...(tools ? { tools, stopWhen: stepCountIs(CHAT_TOOL_STEP_BUDGET) } : {}),
    ...(providerOptions ? { providerOptions } : {}),
    onError: ({ error }) => {
      streamedError = error;
    },
  });

  try {
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        onChunk({ kind: "text", text: part.text });
      } else if (part.type === "reasoning-delta") {
        onChunk({ kind: "reasoning", text: part.text });
      } else if (part.type === "tool-call") {
        onToolEvent?.({ kind: "toolCall", call: { id: part.toolCallId, name: part.toolName, input: part.input } });
      } else if (part.type === "tool-result") {
        onToolEvent?.({ kind: "toolResult", callId: part.toolCallId, output: part.output });
      } else if (part.type === "tool-error") {
        onToolEvent?.({ kind: "toolResult", callId: part.toolCallId, error: part.error });
      } else if (part.type === "abort") {
        wasAborted = true;
      }
    }
  } catch (error) {
    // WHY: The Vercel AI SDK's for-await loop can swallow the actual API error.
    // Prefer the onError payload when present — it has better details.
    throw streamedError ?? error;
  }

  // WHY: once a step has completed, the SDK resolves (instead of rejecting) on abort —
  // the fullStream just ends with an `abort` part. Reject with the signal's reason so a
  // user cancel is never recorded as a successful, non-retryable run; partial chunks
  // already delivered via onChunk are preserved.
  if (wasAborted) {
    throw abortSignal.reason ?? new DOMException("Aborted", "AbortError");
  }

  // WHY: onError may fire without the for-await loop throwing; rethrow so callers still see the failure.
  if (streamedError) throw streamedError;

  // WHY: `usage` is the final step only; `totalUsage` accumulates across tool steps.
  const usage = await result.totalUsage;
  if (usage.inputTokens == null && usage.outputTokens == null) return undefined;

  return {
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}

// WHY: ChatInput.reasoningEffort is a provider-agnostic string. Each wrapper maps it
// into that SDK's providerOptions shape (OpenRouter reasoning.effort vs OpenCode
// reasoningEffort vs Ollama think vs LM Studio reasoningEffort). A shared
// `{ [name]: { reasoningEffort } }` blob would drop OpenRouter.

export function openRouterProviderOptions(reasoningEffort: string | undefined): ProviderOptions | undefined {
  return reasoningEffort ? { openrouter: { reasoning: { effort: reasoningEffort } } } : undefined;
}

export function opencodeGoProviderOptions(reasoningEffort: string | undefined): ProviderOptions | undefined {
  return reasoningEffort ? { "opencode-go": { reasoningEffort } } : undefined;
}

export function opencodeZenProviderOptions(reasoningEffort: string | undefined): ProviderOptions | undefined {
  return reasoningEffort ? { "opencode-zen": { reasoningEffort } } : undefined;
}

export function ollamaProviderOptions(reasoningEffort: string | undefined): ProviderOptions | undefined {
  if (!reasoningEffort) return undefined;
  // WHY: generic thinking models advertise on/off; Ollama's think field is boolean there.
  if (reasoningEffort === "on") return { ollama: { think: true } };
  if (reasoningEffort === "off") return { ollama: { think: false } };
  return { ollama: { think: reasoningEffort } };
}

export function lmstudioProviderOptions(reasoningEffort: string | undefined): ProviderOptions | undefined {
  // WHY: native /api/v1/models advertises on/off; /v1/chat/completions only accepts
  // none|minimal|low|medium|high|xhigh. LM Studio documents medium as "enable".
  if (!reasoningEffort) return undefined;
  if (reasoningEffort === "off") return { lmstudio: { reasoningEffort: "none" } };
  if (reasoningEffort === "on") return { lmstudio: { reasoningEffort: "medium" } };
  return { lmstudio: { reasoningEffort } };
}

export function streamChatWithOpenRouter(
  request: ChatStreamRequest,
  onChunk: (chunk: ChatStreamChunk) => void,
  abortSignal: AbortSignal,
  { apiKey }: { apiKey: string },
) {
  return wrapAIError(async () => {
    const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
    const openrouter = createOpenRouter({ apiKey });
    return runChatStream(
      (modelId) => openrouter(modelId),
      request,
      onChunk,
      abortSignal,
      openRouterProviderOptions(request.input.reasoningEffort),
    );
  });
}

export function streamChatWithOllama(
  request: ChatStreamRequest,
  onChunk: (chunk: ChatStreamChunk) => void,
  abortSignal: AbortSignal,
  { baseUrl, apiKey }: { baseUrl: string; apiKey?: string },
) {
  return wrapAIError(async () => {
    const { createOllama } = await import("ai-sdk-ollama");
    const ollama = createOllama({ baseURL: baseUrl, ...(apiKey ? { apiKey } : {}) });
    return runChatStream(
      (modelId) => ollama(modelId),
      request,
      onChunk,
      abortSignal,
      ollamaProviderOptions(request.input.reasoningEffort),
    );
  });
}

export function streamChatWithOllamaCloud(
  request: ChatStreamRequest,
  onChunk: (chunk: ChatStreamChunk) => void,
  abortSignal: AbortSignal,
  { apiKey }: { apiKey: string },
) {
  return wrapAIError(async () => {
    const { createOllama } = await import("ai-sdk-ollama");
    const ollama = createOllama({ baseURL: OLLAMA_CLOUD_BASE_URL, apiKey });
    return runChatStream(
      (modelId) => ollama(modelId),
      request,
      onChunk,
      abortSignal,
      ollamaProviderOptions(request.input.reasoningEffort),
    );
  });
}

export function streamChatWithLMStudio(
  request: ChatStreamRequest,
  onChunk: (chunk: ChatStreamChunk) => void,
  abortSignal: AbortSignal,
  { baseUrl, apiKey }: { baseUrl: string; apiKey?: string },
) {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const lmstudio = createOpenAICompatible({ name: "lmstudio", baseURL: baseUrl, apiKey });
    return runChatStream(
      (modelId) => lmstudio(modelId),
      request,
      onChunk,
      abortSignal,
      lmstudioProviderOptions(request.input.reasoningEffort),
    );
  });
}

export function streamChatWithOpencodeGo(
  request: ChatStreamRequest,
  onChunk: (chunk: ChatStreamChunk) => void,
  abortSignal: AbortSignal,
  { apiKey }: { apiKey: string },
) {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const opencodeGo = createOpenAICompatible({ name: "opencode-go", baseURL: OPENCODE_GO_BASE_URL, apiKey });
    return runChatStream(
      (modelId) => opencodeGo(modelId),
      request,
      onChunk,
      abortSignal,
      opencodeGoProviderOptions(request.input.reasoningEffort),
    );
  });
}

export function streamChatWithOpencodeZen(
  request: ChatStreamRequest,
  onChunk: (chunk: ChatStreamChunk) => void,
  abortSignal: AbortSignal,
  { apiKey }: { apiKey: string },
) {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const opencodeZen = createOpenAICompatible({ name: "opencode-zen", baseURL: OPENCODE_ZEN_BASE_URL, apiKey });
    return runChatStream(
      (modelId) => opencodeZen(modelId),
      request,
      onChunk,
      abortSignal,
      opencodeZenProviderOptions(request.input.reasoningEffort),
    );
  });
}
