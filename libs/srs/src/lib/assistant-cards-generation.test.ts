import { describe, expect, it } from "vitest";
import { transformGeneratedCards } from "./assistant-cards-generation";

describe("assistant-cards-generation", () => {
  it("generates cards in the new state with no due date", () => {
    const [card] = transformGeneratedCards(
      [
        {
          content: {
            "1": { text: "Front" },
            "2": { text: "Back" },
          },
        },
      ],
      5,
      7,
    );

    expect(card).toMatchObject({ deckId: 5, templateId: 7 });
    expect(card.state).toBe(0);
    expect(card.dueAt).toBeNull();
  });
});
