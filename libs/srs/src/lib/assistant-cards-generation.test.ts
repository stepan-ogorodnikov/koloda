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
      "01900000-0000-7000-8000-000000000005",
      "01900000-0000-7000-8000-000000000007",
    );

    expect(card).toMatchObject({
      deckId: "01900000-0000-7000-8000-000000000005",
      templateId: "01900000-0000-7000-8000-000000000007",
    });
    expect(card.state).toBe(0);
    expect(card.dueAt).toBeNull();
  });
});
