import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { generateText, Output, streamText } from "ai";
import { getCardContentSchema, parseGeneratedCardsText, resolveGenerationTemperature } from "./card-parsing";
import { getConversationMessages } from "./chat-stream";
import { wrapAIError } from "./error";
import type { CardGenerationRequest, GeneratedCard } from "./generation";
import { compilePromptTemplate } from "./prompts";
import { DEFAULT_GENERATION_PROMPT_TEMPLATE } from "./prompts";
import type { AiProvider } from "./provider-catalog";
import { OLLAMA_CLOUD_BASE_URL, OPENCODE_GO_BASE_URL, OPENCODE_ZEN_BASE_URL } from "./provider-catalog";
import { wrapModelWithReasoningExtraction } from "./model-reasoning-extraction";

async function runCardGeneration(
  modelFactory: (modelId: string) => Parameters<typeof wrapModelWithReasoningExtraction>[0],
  providerLabel: AiProvider,
  request: CardGenerationRequest,
  providerOptions?: ProviderOptions,
): Promise<void> {
  const { template, input, messages = [], onCard, abortSignal, systemPromptTemplate } = request;
  const elementSchema = getCardContentSchema(template.content.fields);
  const temperature = resolveGenerationTemperature(input.temperature);
  const systemPrompt = compilePromptTemplate(
    systemPromptTemplate ?? DEFAULT_GENERATION_PROMPT_TEMPLATE,
    template.content.fields,
    providerLabel,
    "generation",
  );
  const chatMessages = getConversationMessages(messages, input.prompt);
  const model = wrapModelWithReasoningExtraction(modelFactory(input.modelId));

  // WORKAROUND: elementStream can finish with zero elements even when the model returned usable text.
  // Prefer parsing result.text before falling through to generateText.
  let cardsCount = 0;
  try {
    let streamedError: unknown = null;
    const result = streamText({
      model,
      temperature,
      output: Output.array({ element: elementSchema }),
      system: systemPrompt,
      messages: chatMessages,
      abortSignal,
      ...(providerOptions ? { providerOptions } : {}),
      onError: ({ error }) => {
        streamedError = error;
      },
    });

    for await (const card of result.elementStream) {
      cardsCount += 1;
      onCard(card as GeneratedCard);
    }

    if (cardsCount > 0) return;

    const streamedText = await result.text;
    const streamedTextCards = parseGeneratedCardsText(streamedText, template.content.fields);
    if (streamedTextCards.length > 0) {
      for (const card of streamedTextCards) onCard(card);
      return;
    }

    if (streamedError) throw streamedError;
  } catch (error) {
    // WHY: Abort must not fall through to plain-text fallback; provider errors may.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    // WHY: Partial structured cards already emitted via onCard — falling
    // through would duplicate deliveries and burn a second provider call.
    if (cardsCount > 0) throw error;
  }

  const fallbackResult = await generateText({
    model,
    temperature,
    system: systemPrompt,
    messages: chatMessages,
    abortSignal,
    ...(providerOptions ? { providerOptions } : {}),
  });
  const fallbackCards = parseGeneratedCardsText(fallbackResult.text, template.content.fields);
  for (const card of fallbackCards) {
    onCard(card);
  }
}

export function generateCardsWithOpenRouter(request: CardGenerationRequest, { apiKey }: { apiKey: string }) {
  return wrapAIError(async () => {
    const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
    const openrouter = createOpenRouter({ apiKey });
    return runCardGeneration((modelId) => openrouter(modelId), "openrouter", request);
  });
}

export function generateCardsWithOllama(
  request: CardGenerationRequest,
  { baseUrl, apiKey }: { baseUrl: string; apiKey?: string },
) {
  return wrapAIError(async () => {
    const { createOllama } = await import("ai-sdk-ollama");
    const ollama = createOllama({ baseURL: baseUrl, ...(apiKey ? { apiKey } : {}) });
    return runCardGeneration((modelId) => ollama(modelId, { structuredOutputs: true }), "ollama", request);
  });
}

export function generateCardsWithOllamaCloud(request: CardGenerationRequest, { apiKey }: { apiKey: string }) {
  return wrapAIError(async () => {
    const { createOllama } = await import("ai-sdk-ollama");
    const ollama = createOllama({ baseURL: OLLAMA_CLOUD_BASE_URL, apiKey });
    return runCardGeneration((modelId) => ollama(modelId, { structuredOutputs: true }), "ollamaCloud", request);
  });
}

export function generateCardsWithLMStudio(
  request: CardGenerationRequest,
  { baseUrl, apiKey }: { baseUrl: string; apiKey?: string },
) {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const lmstudio = createOpenAICompatible({
      name: "lmstudio",
      baseURL: baseUrl,
      apiKey,
      supportsStructuredOutputs: true,
    });
    return runCardGeneration((modelId) => lmstudio(modelId), "lmstudio", request);
  });
}

export function generateCardsWithOpencodeGo(request: CardGenerationRequest, { apiKey }: { apiKey: string }) {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const opencodeGo = createOpenAICompatible({
      name: "opencode-go",
      baseURL: OPENCODE_GO_BASE_URL,
      apiKey,
      supportsStructuredOutputs: true,
    });
    const providerOptions = request.input.reasoningEffort
      ? { "opencode-go": { reasoningEffort: request.input.reasoningEffort } }
      : undefined;
    return runCardGeneration((modelId) => opencodeGo(modelId), "opencodeGo", request, providerOptions);
  });
}

export function generateCardsWithOpencodeZen(request: CardGenerationRequest, { apiKey }: { apiKey: string }) {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const opencodeZen = createOpenAICompatible({
      name: "opencode-zen",
      baseURL: OPENCODE_ZEN_BASE_URL,
      apiKey,
      supportsStructuredOutputs: true,
    });
    const providerOptions = request.input.reasoningEffort
      ? { "opencode-zen": { reasoningEffort: request.input.reasoningEffort } }
      : undefined;
    return runCardGeneration((modelId) => opencodeZen(modelId), "opencodeZen", request, providerOptions);
  });
}
