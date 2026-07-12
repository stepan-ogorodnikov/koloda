import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { generateText, Output, streamText } from "ai";
import { getCardContentSchema, parseGeneratedCardsText, resolveGenerationTemperature } from "./card-parsing";
import { getConversationMessages } from "./chat-stream";
import { wrapAIError } from "./error";
import type { CardGenerationRequest, GeneratedCard } from "./generation";
import { compilePromptTemplate } from "./prompts";
import { DEFAULT_GENERATION_PROMPT_TEMPLATE } from "./prompts";
import type { AiProvider } from "./provider-catalog";
import { OPENCODE_GO_BASE_URL, OPENCODE_ZEN_BASE_URL } from "./provider-catalog";
import type { AISecrets } from "./provider-secrets";

async function runCardGeneration(
  modelFactory: (modelId: string) => Parameters<typeof streamText>[0]["model"],
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

  // Try structured output first (streaming)
  try {
    let streamedError: unknown = null;
    const result = streamText({
      model: modelFactory(input.modelId),
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

    let cardsCount = 0;
    for await (const card of result.elementStream) {
      cardsCount += 1;
      onCard(card as GeneratedCard);
    }

    if (cardsCount > 0) return;

    // Structured stream returned nothing — try parsing the raw text
    const streamedText = await result.text;
    const streamedTextCards = parseGeneratedCardsText(streamedText, template.content.fields);
    if (streamedTextCards.length > 0) {
      for (const card of streamedTextCards) onCard(card);
      return;
    }

    if (streamedError) throw streamedError;
  } catch (error) {
    // Structured output failed (provider/model doesn't support it, etc.)
    // Fall through to plain text completion below.
    // If the error was an abort, re-throw immediately.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
  }

  // Fallback: plain text generation + heuristic parsing
  const fallbackResult = await generateText({
    model: modelFactory(input.modelId),
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

/*
 * Provider-specific card generation
 */

export function generateCardsWithOpenRouter(
  request: CardGenerationRequest,
  { apiKey }: Extract<AISecrets, { provider: "openrouter" }>,
) {
  return wrapAIError(async () => {
    const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
    const openrouter = createOpenRouter({ apiKey });
    return runCardGeneration((modelId) => openrouter(modelId), "openrouter", request);
  });
}

export function generateCardsWithOllama(
  request: CardGenerationRequest,
  { baseUrl, apiKey }: Extract<AISecrets, { provider: "ollama" }>,
) {
  return wrapAIError(async () => {
    const { createOllama } = await import("ai-sdk-ollama");
    const ollama = createOllama({ baseURL: baseUrl, ...(apiKey ? { apiKey } : {}) });
    return runCardGeneration((modelId) => ollama(modelId, { structuredOutputs: true }), "ollama", request);
  });
}

export function generateCardsWithLMStudio(
  request: CardGenerationRequest,
  { baseUrl, apiKey }: Extract<AISecrets, { provider: "lmstudio" }>,
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

export function generateCardsWithOpencodeGo(
  request: CardGenerationRequest,
  { apiKey }: Extract<AISecrets, { provider: "opencodeGo" }>,
) {
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

export function generateCardsWithOpencodeZen(
  request: CardGenerationRequest,
  { apiKey }: Extract<AISecrets, { provider: "opencodeZen" }>,
) {
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
