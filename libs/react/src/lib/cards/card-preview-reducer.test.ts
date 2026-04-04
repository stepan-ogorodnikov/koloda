import { describe, expect, it } from "vitest";
import { createCard, createTemplate } from "../../test/test-helpers";
import { cardPreviewReducer, cardPreviewReducerDefault } from "./card-preview-reducer";

type CardPreviewAction = Parameters<typeof cardPreviewReducer>[1];

function reducePreview(actions: CardPreviewAction[]) {
  return actions.reduce(
    (state, action) => cardPreviewReducer(state, action),
    structuredClone(cardPreviewReducerDefault),
  );
}

describe("cardPreviewReducer", () => {
  it("builds lesson-style preview content once both card and template are available", () => {
    const card = createCard();
    const template = createTemplate();
    const state = reducePreview([
      ["templateUpdated", template],
      ["cardUpdated", card],
    ]);

    expect(state.content?.card).toEqual(card);
    expect(state.content?.template.layout[0]?.field?.title).toBe("Front");
    expect(state.content?.form.firstInputFieldId).toBe(2);
    expect(state.content?.form.isSubmitted).toBe(false);
  });

  it("auto-submits display-only templates", () => {
    const state = reducePreview([
      [
        "templateUpdated",
        createTemplate({
          content: {
            fields: [
              { id: 1, title: "Front", type: "text", isRequired: true },
              { id: 2, title: "Back", type: "text", isRequired: true },
            ],
            layout: [
              { field: 1, operation: "display" },
              { field: 2, operation: "display" },
            ],
          },
        }),
      ],
      ["cardUpdated", createCard()],
    ]);

    expect(state.content?.form.isSubmitted).toBe(true);
    expect(state.content?.form.firstInputFieldId).toBeUndefined();
  });

  it("tracks preview form changes and submission", () => {
    let state = reducePreview([
      ["templateUpdated", createTemplate()],
      ["cardUpdated", createCard()],
    ]);

    state = cardPreviewReducer(state, ["cardFormUpdated", { key: 2, value: "typed preview" }]);
    state = cardPreviewReducer(state, ["cardSubmitted"]);

    expect(state.content?.form.data[2]).toBe("typed preview");
    expect(state.content?.form.isSubmitted).toBe(true);
  });
});
