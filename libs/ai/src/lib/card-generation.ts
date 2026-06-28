import { generateText, Output, streamText } from "ai";
import { getCardContentSchema, parseGeneratedCardsText, resolveGenerationTemperature } from "./card-parsing";
import { getConversationMessages } from "./chat-stream";
import { wrapAIError } from "./error";
import { compilePromptTemplate } from "./prompts";
import type { AISecrets, CardGenerationRequest, GeneratedCard } from "./types";
import { DEFAULT_GENERATION_PROMPT_TEMPLATE, OPENCODE_GO_BASE_URL, OPENCODE_ZEN_BASE_URL } from "./types";

async function runStructuredCardGeneration(
  modelFactory: (modelId: string) => Parameters<typeof streamText>[0]["model"],
  request: CardGenerationRequest,
): Promise<void> {
  const { template, input, messages = [], onCard, abortSignal, systemPromptTemplate } = request;
  const elementSchema = getCardContentSchema(template.content.fields);
  const temperature = resolveGenerationTemperature(input.temperature);
  let streamedError: unknown = null;

  try {
    const result = streamText({
      model: modelFactory(input.modelId),
      temperature,
      output: Output.array({ element: elementSchema }),
      system: compilePromptTemplate(
        systemPromptTemplate ?? DEFAULT_GENERATION_PROMPT_TEMPLATE,
        template.content.fields,
        "openrouter",
        "generation",
      ),
      messages: getConversationMessages(messages, input.prompt),
      abortSignal,
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

    const streamedText = await result.text;
    const streamedTextCards = parseGeneratedCardsText(streamedText, template.content.fields);
    if (streamedTextCards.length > 0) {
      for (const card of streamedTextCards) onCard(card);
      return;
    }

    const fallbackTextResult = await generateText({
      model: modelFactory(input.modelId),
      temperature,
      system: compilePromptTemplate(
        systemPromptTemplate ?? DEFAULT_GENERATION_PROMPT_TEMPLATE,
        template.content.fields,
        "openrouter",
        "generation",
      ),
      messages: getConversationMessages(messages, input.prompt),
      abortSignal,
    });
    const fallbackCards = parseGeneratedCardsText(fallbackTextResult.text, template.content.fields);

    for (const card of fallbackCards) {
      onCard(card);
    }
  } catch (error) {
    throw streamedError ?? error;
  }
}

async function runTextCompletionCardGeneration(
  completeText: (request: CardGenerationRequest) => Promise<string>,
  request: CardGenerationRequest,
): Promise<void> {
  const text = await completeText(request);
  const { template, onCard } = request;
  const cards = parseGeneratedCardsText(text, template.content.fields);

  for (const card of cards) {
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
    return runStructuredCardGeneration((modelId) => openrouter(modelId), request);
  });
}

export function generateCardsWithOllama(
  request: CardGenerationRequest,
  { baseUrl, apiKey }: Extract<AISecrets, { provider: "ollama" }>,
) {
  return wrapAIError(async () => {
    const { createOllama } = await import("ai-sdk-ollama");
    const ollama = createOllama({ baseURL: baseUrl, ...(apiKey ? { apiKey } : {}) });

    return runTextCompletionCardGeneration(
      async ({ template, input, messages = [], abortSignal, systemPromptTemplate }) => {
        const result = await generateText({
          model: ollama(input.modelId),
          temperature: resolveGenerationTemperature(input.temperature),
          system: compilePromptTemplate(
            systemPromptTemplate ?? DEFAULT_GENERATION_PROMPT_TEMPLATE,
            template.content.fields,
            "ollama",
            "generation",
          ),
          messages: getConversationMessages(messages, input.prompt),
          abortSignal,
        });
        return result.text;
      },
      request,
    );
  });
}

export function generateCardsWithLMStudio(
  request: CardGenerationRequest,
  { baseUrl, apiKey }: Extract<AISecrets, { provider: "lmstudio" }>,
) {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const lmstudio = createOpenAICompatible({ name: "lmstudio", baseURL: baseUrl, apiKey });

    return runTextCompletionCardGeneration(
      async ({ template, input, messages = [], abortSignal, systemPromptTemplate }) => {
        const result = await generateText({
          model: lmstudio(input.modelId),
          temperature: resolveGenerationTemperature(input.temperature),
          system: compilePromptTemplate(
            systemPromptTemplate ?? DEFAULT_GENERATION_PROMPT_TEMPLATE,
            template.content.fields,
            "lmstudio",
            "generation",
          ),
          messages: getConversationMessages(messages, input.prompt),
          abortSignal,
        });
        return result.text;
      },
      request,
    );
  });
}

export function generateCardsWithOpencodeGo(
  request: CardGenerationRequest,
  { apiKey }: Extract<AISecrets, { provider: "opencodeGo" }>,
) {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const opencodeGo = createOpenAICompatible({ name: "opencode-go", baseURL: OPENCODE_GO_BASE_URL, apiKey });

    return runTextCompletionCardGeneration(
      async ({ template, input, messages = [], abortSignal, systemPromptTemplate }) => {
        const result = await generateText({
          model: opencodeGo(input.modelId),
          temperature: resolveGenerationTemperature(input.temperature),
          system: compilePromptTemplate(
            systemPromptTemplate ?? DEFAULT_GENERATION_PROMPT_TEMPLATE,
            template.content.fields,
            "opencodeGo",
            "generation",
          ),
          messages: getConversationMessages(messages, input.prompt),
          abortSignal,
          providerOptions: input.reasoningEffort
            ? { "opencode-go": { reasoningEffort: input.reasoningEffort } }
            : undefined,
        });
        return result.text;
      },
      request,
    );
  });
}

export function generateCardsWithOpencodeZen(
  request: CardGenerationRequest,
  { apiKey }: Extract<AISecrets, { provider: "opencodeZen" }>,
) {
  return wrapAIError(async () => {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const opencodeZen = createOpenAICompatible({ name: "opencode-zen", baseURL: OPENCODE_ZEN_BASE_URL, apiKey });

    return runTextCompletionCardGeneration(
      async ({ template, input, messages = [], abortSignal, systemPromptTemplate }) => {
        const result = await generateText({
          model: opencodeZen(input.modelId),
          temperature: resolveGenerationTemperature(input.temperature),
          system: compilePromptTemplate(
            systemPromptTemplate ?? DEFAULT_GENERATION_PROMPT_TEMPLATE,
            template.content.fields,
            "opencodeZen",
            "generation",
          ),
          messages: getConversationMessages(messages, input.prompt),
          abortSignal,
          providerOptions: input.reasoningEffort
            ? { "opencode-zen": { reasoningEffort: input.reasoningEffort } }
            : undefined,
        });
        return result.text;
      },
      request,
    );
  });
}
