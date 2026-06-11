import { generateText, Output, streamText } from "ai";
import { parseGeneratedCardsText, resolveGenerationTemperature } from "./card-parsing";
import { getConversationMessages } from "./chat-stream";
import { AIError, throwForAIResponse, wrapAIError } from "./error";
import { compilePromptTemplate } from "./prompts";
import type { AiProvider, AISecrets, CardGenerationFields, CardGenerationRequest, GeneratedCard } from "./types";
import { DEFAULT_GENERATION_PROMPT_TEMPLATE } from "./types";

async function runStructuredCardGeneration(
  modelFactory: (modelId: string) => Parameters<typeof streamText>[0]["model"],
  request: CardGenerationRequest,
): Promise<void> {
  const { template, input, messages = [], onCard, abortSignal, systemPromptTemplate } = request;
  const { getCardContentSchema } = await import("./card-parsing");
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
  secrets: Extract<AISecrets, { provider: "openrouter" }>,
) {
  return wrapAIError(async () => {
    const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
    const openrouter = createOpenRouter({ apiKey: secrets.apiKey });
    return runStructuredCardGeneration((modelId) => openrouter(modelId), request);
  });
}

export function generateCardsWithOllama(
  request: CardGenerationRequest,
  baseUrl: string,
) {
  return wrapAIError(() =>
    runTextCompletionCardGeneration(async ({ template, input, messages, abortSignal, systemPromptTemplate }) => {
      const temperature = resolveGenerationTemperature(input.temperature);
      const response = throwForAIResponse(
        await fetch(new URL("/api/chat", baseUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: input.modelId,
            messages: getTextCompletionMessages({
              fields: template.content.fields,
              prompt: input.prompt,
              messages,
              provider: "ollama",
              systemPromptTemplate,
            }),
            options: { temperature },
            stream: false,
          }),
          signal: abortSignal,
        }),
      );

      const data = await response.json() as OllamaChatResponse;
      const content = data.message?.content;
      if (typeof content !== "string") throw new AIError("ai.invalid-response");

      return content;
    }, request)
  );
}

export function generateCardsWithLMStudio(
  request: CardGenerationRequest,
  secrets: Extract<AISecrets, { provider: "lmstudio" }>,
) {
  return wrapAIError(() =>
    runTextCompletionCardGeneration(async ({ template, input, messages, abortSignal, systemPromptTemplate }) => {
      const temperature = resolveGenerationTemperature(input.temperature);
      const response = throwForAIResponse(
        await fetch(new URL("/v1/chat/completions", secrets.baseUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(secrets.apiKey ? { Authorization: `Bearer ${secrets.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: input.modelId,
            temperature,
            messages: getTextCompletionMessages({
              fields: template.content.fields,
              prompt: input.prompt,
              messages,
              provider: "lmstudio",
              systemPromptTemplate,
            }),
          }),
          signal: abortSignal,
        }),
      );

      const data = await response.json() as OpenAICompatibleChatCompletionsResponse;
      const content = data.choices?.[0]?.message?.content;
      if (content == null) throw new AIError("ai.invalid-response");
      return content;
    }, request)
  );
}

/*
 * Internal helpers
 */

type OllamaChatResponse = {
  message?: {
    content?: string | null;
  };
};

type OpenAICompatibleChatCompletionsResponse = {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
};

type GetTextCompletionMessagesParams = {
  fields: CardGenerationFields;
  prompt: string;
  messages?: { role: string; content: string }[];
  provider: AiProvider;
  systemPromptTemplate?: string;
};

function getTextCompletionMessages(
  { fields, prompt, messages = [], provider, systemPromptTemplate }: GetTextCompletionMessagesParams,
) {
  return [
    {
      role: "system" as const,
      content: compilePromptTemplate(
        systemPromptTemplate ?? DEFAULT_GENERATION_PROMPT_TEMPLATE,
        fields,
        provider,
        "generation",
      ),
    },
    ...getConversationMessages(messages, prompt),
  ];
}
