import type { GeneratedCard } from "@koloda/ai";
import type { InsertCardData } from "./cards";

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
