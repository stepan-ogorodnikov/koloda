import type { OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import { generateText, type ModelMessage, Output, streamText } from "ai";
import { z } from "zod";
import { throwForAIResponse, wrapAIError } from "./ai-error";
import type { InsertCardData } from "./cards";
import { AppError } from "./error";
import type { AiProvider, AISecrets } from "./settings-ai";
import type { Template, TemplateFields } from "./templates";

export const GENERATION_TEMPERATURE = 0.2;

export type ChatStreamRequest = {
  messages: ModelMessage[];
  input: GenerateCardsInput;
  template?: Template;
};

export type ChatStreamGenerator = (
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
) => Promise<void>;

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
  messages?: ModelMessage[];
  onCard: OnCardGenerated;
  abortSignal?: AbortSignal;
};

export type GenerateCardsInput = z.input<typeof generateCardsInputSchema>;
export type GeneratedCard = { content: Record<string, { text: string }> };
export type OnCardGenerated = (card: GeneratedCard) => void;
export type GenerateCardsFunction = (request: CardGenerationRequest) => Promise<void>;

function buildFieldDescriptions(fields: TemplateFields): string {
  return fields
    .map((f) => `- "${f.id}": ${f.title} (${f.type}${f.isRequired ? ", required" : ", optional"})`)
    .join("\n");
}

function buildCardGenerationRules(context: "structured" | "assistant"): string {
  const noExtras = context === "assistant"
    ? "- Do not add extra keys, comments, explanations, markdown, headings, or prose when generating cards."
    : "- Do not add extra keys, comments, explanations, markdown, headings, or prose.";

  return [
    '- Each card must be { "content": { ... } } where each field key maps to { "text": "..." }.',
    '- "content" keys must be ONLY the field keys listed above.',
    noExtras,
    "- Keep text concise, educational, and accurate.",
    "- For required fields, never return empty text.",
    "- Follow the requested card count exactly when specified.",
  ].join("\n");
}

function buildMarkdownFormatInstructions(fields: TemplateFields): string {
  return [
    "When generating cards without structured output, format each card exactly as:",
    "## Card <number>",
    ...fields.map((field) => `**${field.title}**: <value>`),
    "Only output cards in this exact format.",
  ].join("\n");
}

export function buildSystemPrompt(fields: TemplateFields, providerPrompt = ""): string {
  const corePrompt = [
    "You are a flashcard generator that must produce strictly structured flashcard data.",
    "The flashcards have the following fields:",
    buildFieldDescriptions(fields),
    "Rules:",
    "- Output must match the provided schema exactly.",
    buildCardGenerationRules("structured"),
  ].join("\n");

  return providerPrompt ? `${corePrompt}\n\n${providerPrompt}` : corePrompt;
}

export function buildProviderFormatPrompt(fields: TemplateFields) {
  return ["Provider-specific format instructions:", buildMarkdownFormatInstructions(fields)].join("\n");
}

export function buildSystemPromptForProvider(fields: TemplateFields, provider?: AiProvider | null) {
  if (!provider || provider === "openrouter") return buildSystemPrompt(fields);
  return buildSystemPrompt(fields, buildProviderFormatPrompt(fields));
}

export function buildAssistantSystemPrompt(fields: TemplateFields, provider?: AiProvider | null): string {
  const formatInstructions = provider && provider !== "openrouter"
    ? "\n\n" + buildMarkdownFormatInstructions(fields)
    : "";

  return [
    "You are a helpful AI study assistant embedded in a flashcard app.",
    "You can answer questions, explain concepts, and have conversations.",
    "When the user asks you to generate flashcards, you must produce structured card data.",
    "",
    "The flashcards have the following fields:",
    buildFieldDescriptions(fields),
    "",
    "Rules for card generation:",
    buildCardGenerationRules("assistant"),
    formatInstructions,
  ].filter(Boolean).join("\n");
}

export function generateCardsWithOpenRouter(request: CardGenerationRequest, openrouter: OpenRouterProvider) {
  return wrapAIError(() => runStructuredCardGeneration((modelId) => openrouter(modelId), request));
}

export function generateCardsWithOllama(request: CardGenerationRequest, baseUrl: string) {
  return wrapAIError(() =>
    runTextCompletionCardGeneration(async ({ template, input, messages, abortSignal }) => {
      const temperature = resolveGenerationTemperature(input.temperature);
      const response = throwForAIResponse(
        await fetch(new URL("/api/chat", baseUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: input.modelId,
            messages: getTextCompletionMessages({
              template,
              prompt: input.prompt,
              messages,
              provider: "ollama",
            }),
            options: { temperature },
            stream: false,
          }),
          signal: abortSignal,
        }),
      );

      const data = await response.json() as OllamaChatResponse;
      const content = data.message?.content;
      if (typeof content !== "string") throw new AppError("ai.invalid-response");

      return content;
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
    runTextCompletionCardGeneration(async ({ template, input, messages, abortSignal }) => {
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
              template,
              prompt: input.prompt,
              messages,
              provider: "lmstudio",
            }),
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

function validateExtractedCards(cards: GeneratedCard[], fields: TemplateFields): GeneratedCard[] {
  const schema = getCardContentSchema(fields);
  const valid = cards.filter((card) => schema.safeParse(card).success);
  if (cards.length > 0 && valid.length === 0) {
    throw new AppError("ai.invalid-response", "Extracted cards failed schema validation");
  }
  return valid;
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
  { template, input, messages = [], onCard, abortSignal }: CardGenerationRequest,
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
    const streamedTextCards = validateExtractedCards([
      ...extractCardsFromJsonArray(streamedText, template),
      ...extractCardsFromMarkdownText(streamedText, template),
    ], template.content.fields);
    if (streamedTextCards.length > 0) {
      for (const card of streamedTextCards) onCard(card);
      return;
    }

    const fallbackTextResult = await generateText({
      model: modelFactory(input.modelId),
      temperature,
      system: buildSystemPromptForProvider(template.content.fields, "openrouter"),
      messages: getConversationMessages(messages, input.prompt),
      abortSignal,
    });
    const fallbackCards = validateExtractedCards([
      ...extractCardsFromJsonArray(fallbackTextResult.text, template),
      ...extractCardsFromMarkdownText(fallbackTextResult.text, template),
    ], template.content.fields);

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
  const cards = validateExtractedCards([
    ...extractCardsFromJsonArray(text, template),
    ...extractCardsFromMarkdownText(text, template),
  ], template.content.fields);

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

type OllamaChatResponse = {
  message?: {
    content?: string | null;
  };
};

function getConversationMessages(messages: ModelMessage[], prompt: string) {
  return [...messages, { role: "user", content: prompt }] as ModelMessage[];
}

type GetTextCompletionMessagesParams = {
  template: Template;
  prompt: string;
  messages?: ModelMessage[];
  provider: Exclude<AiProvider, "openrouter">;
};

function getTextCompletionMessages({ template, prompt, messages = [], provider }: GetTextCompletionMessagesParams) {
  return [
    {
      role: "system",
      content: buildSystemPromptForProvider(template.content.fields, provider),
    },
    ...getConversationMessages(messages, prompt),
  ];
}

/**
 * @section Chat streaming
 */

export async function streamChatWithOpenRouter(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  openrouter: OpenRouterProvider,
): Promise<void> {
  return wrapAIError(async () => {
    const result = streamText({
      model: openrouter(request.input.modelId),
      temperature: resolveGenerationTemperature(request.input.temperature),
      system: buildAssistantSystemPrompt(request.template?.content.fields ?? []),
      messages: request.messages,
      abortSignal,
    });

    for await (const chunk of result.textStream) {
      onChunk(chunk);
    }
  });
}

export async function streamChatWithOllama(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  baseUrl: string,
): Promise<void> {
  return wrapAIError(async () => {
    const response = throwForAIResponse(
      await fetch(new URL("/api/chat", baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: request.input.modelId,
          system: buildAssistantSystemPrompt(request.template?.content.fields ?? [], "ollama"),
          messages: request.messages,
          options: { temperature: resolveGenerationTemperature(request.input.temperature) },
          stream: true,
        }),
        signal: abortSignal,
      }),
    );

    await readOllamaChatStream(response, onChunk);
  });
}

export async function streamChatWithLMStudio(
  request: ChatStreamRequest,
  onChunk: (chunk: string) => void,
  abortSignal: AbortSignal,
  secrets: Extract<AISecrets, { provider: "lmstudio" }>,
): Promise<void> {
  return wrapAIError(async () => {
    const systemMessage = buildAssistantSystemPrompt(request.template?.content.fields ?? [], "lmstudio");
    const messages = systemMessage
      ? [{ role: "system", content: systemMessage }, ...request.messages]
      : request.messages;

    const response = throwForAIResponse(
      await fetch(new URL("/v1/chat/completions", secrets.baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secrets.apiKey ? { Authorization: `Bearer ${secrets.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: request.input.modelId,
          temperature: resolveGenerationTemperature(request.input.temperature),
          messages,
          stream: true,
        }),
        signal: abortSignal,
      }),
    );

    await readOpenAICompatibleChatStream(response, onChunk);
  });
}

async function readOllamaChatStream(response: Response, onChunk: (chunk: string) => void) {
  const reader = response.body?.getReader();
  if (!reader) throw new AppError("ai.invalid-response");

  const decoder = new TextDecoder();
  let buffer = "";

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
          const data = JSON.parse(line) as { message?: { content?: string } };
          const content = data.message?.content;
          if (typeof content === "string") onChunk(content);
        } catch {
          // Ignore parse errors for malformed lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function readOpenAICompatibleChatStream(response: Response, onChunk: (chunk: string) => void) {
  const reader = response.body?.getReader();
  if (!reader) throw new AppError("ai.invalid-response");

  const decoder = new TextDecoder();
  let buffer = "";

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
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          const content = parsed.choices?.[0]?.delta?.content;
          if (typeof content === "string") onChunk(content);
        } catch {
          // Ignore parse errors for malformed lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
