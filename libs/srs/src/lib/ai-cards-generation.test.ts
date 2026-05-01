import { describe, expect, it } from "vitest";
import { transformGeneratedCards } from "./ai-cards-generation";

describe("ai-cards-generation", () => {
  it("transforms generated cards into insertable card payloads", () => {
    expect(transformGeneratedCards(
      [{
        content: {
          "1": { text: "Front" },
          "2": { text: "Back" },
        },
      }],
      5,
      7,
    )).toEqual([{
      deckId: 5,
      templateId: 7,
      content: {
        "1": { text: "Front" },
        "2": { text: "Back" },
      },
      state: 0,
      dueAt: null,
      stability: 0,
      difficulty: 0,
      scheduledDays: 0,
      learningSteps: 0,
      reps: 0,
      lapses: 0,
      lastReviewedAt: null,
    }]);
  });
});
