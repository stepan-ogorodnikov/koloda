import { z } from "zod";
import { AIError } from "./error";
import type { CardGenerationFields, GeneratedCard } from "./types";
import { GENERATION_TEMPERATURE } from "./types";

export function getCardContentSchema(fields: CardGenerationFields) {
  const fieldSchema = fields.reduce((acc, field) => {
    const textSchema = field.isRequired ? z.string().min(1) : z.string();
    return {
      ...acc,
      [field.id.toString()]: z.object({ text: textSchema }),
    };
  }, {} as Record<string, z.ZodObject<{ text: z.ZodString }>>);

  return z.object({ content: z.object(fieldSchema) });
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function validateExtractedCards(cards: GeneratedCard[], fields: CardGenerationFields): GeneratedCard[] {
  const schema = getCardContentSchema(fields);
  const valid = cards.filter((card) => schema.safeParse(card).success);
  if (cards.length > 0 && valid.length === 0) {
    throw new AIError("ai.invalid-response", "Extracted cards failed schema validation");
  }
  return valid;
}

export function resolveGenerationTemperature(value?: number) {
  return typeof value === "number" ? value : GENERATION_TEMPERATURE;
}

export function parseGeneratedCardsText(text: string, fields: CardGenerationFields): GeneratedCard[] {
  return validateExtractedCards([
    ...extractCardsFromJsonArray(text, fields),
    ...extractCardsFromMarkdownText(text, fields),
  ], fields);
}

function extractCardsFromJsonArray(text: string, fields: CardGenerationFields): GeneratedCard[] {
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

        for (const field of fields) {
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

function extractCardsFromMarkdownText(text: string, fields: CardGenerationFields): GeneratedCard[] {
  if (fields.length === 0) return [];

  const cardBlocks = text.match(/(?:^|\n)#{1,6}\s*card\b[\s\S]*?(?=(?:\n#{1,6}\s*card\b)|$)/gi) ?? [];
  const blocks = cardBlocks.length > 0 ? cardBlocks : [text];
  const cards: GeneratedCard[] = [];

  for (const block of blocks) {
    const labelEntries = [...block.matchAll(/\*\*([^*]+)\*\*:[^\S\n]*([\s\S]*?)(?=(?:\n\*\*[^*]+\*\*):|$)/g)];
    if (labelEntries.length === 0) continue;

    const valuesInOrder = labelEntries.map((entry) => entry[2].trim()).filter(Boolean);
    const byLabel = new Map<string, string>();
    for (const entry of labelEntries) {
      const label = normalizeLabel(entry[1]);
      const value = entry[2].trim();
      byLabel.set(label, value);
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
