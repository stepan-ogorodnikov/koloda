import type { OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import { generateText, Output, streamText } from "ai";
import { z } from "zod";
import { throwForAIResponse, wrapAIError } from "./ai-error";
import type { InsertCardData } from "./cards";
import { AppError } from "./error";
import type { AiProvider, AISecrets } from "./settings-ai";
import type { Template, TemplateFields } from "./templates";

export const GENERATION_TEMPERATURE = 0.2;

export const generateCardsInputSchema = z.object({
  credentialId: z.uuid(),
  modelId: z.string().min(1),
  prompt: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  deckId: z.int().positive(),
  templateId: z.int().positive(),
});

export type CardGenerationRequest = {
  template: Template;
  input: GenerateCardsInput;
  onCard: OnCardGenerated;
  abortSignal?: AbortSignal;
};

export type GenerateCardsInput = z.input<typeof generateCardsInputSchema>;
export type GeneratedCard = { content: Record<string, { text: string }> };
export type OnCardGenerated = (card: GeneratedCard) => void;
export type GenerateCardsFunction = (request: CardGenerationRequest) => Promise<void>;

export function buildSystemPrompt(fields: TemplateFields, providerPrompt = ""): string {
  const fieldDescriptions = fields
    .map((f) => `- key "${f.id}" => ${f.title} (${f.type}${f.isRequired ? ", required" : ", optional"})`)
    .join("\n");

  const corePrompt = [
    "You are a flashcard generator that must produce strictly structured flashcard data.",
    "The flashcards have the following fields:",
    fieldDescriptions,
    "Rules:",
    "- Output must match the provided schema exactly.",
    "- Each card must be { \"content\": { ... } } where each field key maps to { \"text\": \"...\" }.",
    "- \"content\" keys must be ONLY the field keys listed above.",
    "- Do not add extra keys, comments, explanations, markdown, headings, or prose.",
    "- Keep text concise, educational, and accurate.",
    "- For required fields, never return empty text.",
    "- Follow the requested card count exactly when specified.",
  ].join("\n");

  return providerPrompt ? `${corePrompt}\n\n${providerPrompt}` : corePrompt;
}

export function buildProviderFormatPrompt(fields: TemplateFields) {
  return [
    "Provider-specific format instructions:",
    "When not using native structured output, format each card exactly as:",
    "## Card <number>",
    ...fields.map((field) => `**${field.title}**: <value>`),
    "Only output cards in this exact format.",
  ].join("\n");
}

export function buildSystemPromptForProvider(fields: TemplateFields, provider?: AiProvider | null) {
  if (!provider || provider === "openrouter") return buildSystemPrompt(fields);
  return buildSystemPrompt(fields, buildProviderFormatPrompt(fields));
}

export function generateCardsWithOpenRouter(request: CardGenerationRequest, openrouter: OpenRouterProvider) {
  return wrapAIError(() => runStructuredCardGeneration((modelId) => openrouter(modelId), request));
}

export function generateCardsWithOllama(request: CardGenerationRequest, baseUrl: string) {
  return wrapAIError(() =>
    runTextCompletionCardGeneration(async ({ template, input, abortSignal }) => {
      const temperature = resolveGenerationTemperature(input.temperature);
      const response = throwForAIResponse(
        await fetch(new URL("/api/generate", baseUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: input.modelId,
            system: buildSystemPrompt(template.content.fields, buildProviderFormatPrompt(template.content.fields)),
            prompt: input.prompt,
            temperature,
            stream: false,
          }),
          signal: abortSignal,
        }),
      );

      const data = await response.json() as { response?: string };
      if (typeof data.response !== "string") throw new AppError("ai.invalid-response");

      return data.response;
    }, request)
  );
}

export type OpenAICompatibleChatCompletionsResponse = {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
};

export function generateCardsWithLMStudio(
  request: CardGenerationRequest,
  secrets: Extract<AISecrets, { provider: "lmstudio" }>,
) {
  return wrapAIError(() =>
    runTextCompletionCardGeneration(async ({ template, input, abortSignal }) => {
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
            messages: [
              {
                role: "system",
                content: buildSystemPrompt(template.content.fields, buildProviderFormatPrompt(template.content.fields)),
              },
              {
                role: "user",
                content: input.prompt,
              },
            ],
          }),
          signal: abortSignal,
        }),
      );

      const data = await response.json() as OpenAICompatibleChatCompletionsResponse;
      const content = data.choices?.[0]?.message?.content;
      if (content == null) throw new AppError("ai.invalid-response");
      return content;
    }, request)
  );
}

export function getCardContentSchema(fields: TemplateFields) {
  const fieldSchema = fields.reduce((acc, field) => {
    const textSchema = field.isRequired ? z.string().min(1) : z.string();
    return {
      ...acc,
      [field.id.toString()]: z.object({ text: textSchema }),
    };
  }, {});

  return z.object({ content: z.object(fieldSchema) });
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function resolveGenerationTemperature(value?: number) {
  return typeof value === "number" ? value : GENERATION_TEMPERATURE;
}

function extractCardsFromJsonArray(text: string, template: Template): GeneratedCard[] {
  const jsonFenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = (jsonFenceMatch?.[1] ?? text).trim();
  if (!candidate) return [];

  try {
    const parsed = JSON.parse(candidate);
    if (!Array.isArray(parsed)) return [];

    const cards = parsed
      .map((item): GeneratedCard | null => {
        if (!item || typeof item !== "object" || typeof item.content !== "object" || !item.content) return null;
        const content: GeneratedCard["content"] = {};
        let hasValue = false;

        for (const field of template.content.fields) {
          const key = field.id.toString();
          const raw = (item.content as Record<string, unknown>)[key];
          const textValue = raw && typeof raw === "object" && "text" in raw
            ? String((raw as { text?: unknown }).text ?? "").trim()
            : "";
          if (textValue) hasValue = true;
          content[key] = { text: textValue };
        }

        return hasValue ? { content } : null;
      })
      .filter((card): card is GeneratedCard => card !== null);

    return cards;
  } catch {
    return [];
  }
}

function extractCardsFromMarkdownText(text: string, template: Template): GeneratedCard[] {
  const fields = template.content.fields;
  if (fields.length === 0) return [];

  const cardBlocks = text.match(/(?:^|\n)#{1,6}\s*card\b[\s\S]*?(?=(?:\n#{1,6}\s*card\b)|$)/gi) ?? [];
  const blocks = cardBlocks.length > 0 ? cardBlocks : [text];
  const cards: GeneratedCard[] = [];

  for (const block of blocks) {
    const labelEntries = [...block.matchAll(/\*\*([^*]+)\*\*:\s*([\s\S]*?)(?=(?:\n\*\*[^*]+\*\*:)|$)/g)];
    if (labelEntries.length === 0) continue;

    const valuesInOrder = labelEntries.map((entry) => entry[2].trim()).filter(Boolean);
    const byLabel = new Map<string, string>();
    for (const entry of labelEntries) {
      const label = normalizeLabel(entry[1]);
      const value = entry[2].trim();
      if (value) byLabel.set(label, value);
    }

    let nextFallbackValue = 0;
    const content: GeneratedCard["content"] = {};
    let hasValue = false;

    for (const field of fields) {
      const key = field.id.toString();
      const mappedValue = byLabel.get(normalizeLabel(field.title));
      const fallbackValue = valuesInOrder[nextFallbackValue];
      const value = mappedValue ?? fallbackValue ?? "";
      if (!mappedValue && fallbackValue) nextFallbackValue += 1;

      const textValue = value.trim();
      if (textValue) hasValue = true;
      content[key] = { text: textValue };
    }

    if (hasValue) cards.push({ content });
  }

  return cards;
}

async function runStructuredCardGeneration(
  modelFactory: (modelId: string) => Parameters<typeof streamText>[0]["model"],
  { template, input, onCard, abortSignal }: CardGenerationRequest,
): Promise<void> {
  const elementSchema = getCardContentSchema(template.content.fields);
  const temperature = resolveGenerationTemperature(input.temperature);
  let streamedError: unknown = null;

  try {
    const result = streamText({
      model: modelFactory(input.modelId),
      temperature,
      output: Output.array({ element: elementSchema }),
      system: buildSystemPrompt(template.content.fields),
      prompt: input.prompt,
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
    const streamedTextCards = [
      ...extractCardsFromJsonArray(streamedText, template),
      ...extractCardsFromMarkdownText(streamedText, template),
    ];
    if (streamedTextCards.length > 0) {
      for (const card of streamedTextCards) onCard(card);
      return;
    }

    const fallbackTextResult = await generateText({
      model: modelFactory(input.modelId),
      temperature,
      system: buildSystemPrompt(template.content.fields, buildProviderFormatPrompt(template.content.fields)),
      prompt: input.prompt,
      abortSignal,
    });
    const fallbackCards = [
      ...extractCardsFromJsonArray(fallbackTextResult.text, template),
      ...extractCardsFromMarkdownText(fallbackTextResult.text, template),
    ];

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
  const cards = [
    ...extractCardsFromJsonArray(text, template),
    ...extractCardsFromMarkdownText(text, template),
  ];

  for (const card of cards) {
    onCard(card);
  }
}

export function transformGeneratedCards(
  cards: GeneratedCard[],
  deckId: number,
  templateId: number,
): InsertCardData[] {
  return cards.map((card) => ({
    deckId,
    templateId,
    content: card.content,
    state: 0 as const,
    dueAt: null,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
  }));
}
