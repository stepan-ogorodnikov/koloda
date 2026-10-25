import { queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type { LessonTemplateLayoutItem, TemplateFieldType, TemplateOperation } from "@koloda/srs";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { describe, expect, it } from "vitest";
import { createCard, createQueryClient, testId } from "../../test/test-helpers";
import { LessonCardField } from "./lesson-card-field";

function renderField(operation: TemplateOperation, type: TemplateFieldType, isSubmitted: boolean) {
  const field = { id: testId(11), title: "Answer", type, isRequired: true };
  const item: LessonTemplateLayoutItem = { field, fieldId: field.id, operation };
  const store = createStore();
  store.set(queriesAtom, { getAttachmentQuery: () => ({ queryKey: ["attachment"] }) } as unknown as Queries);

  const { container } = render(
    <QueryClientProvider client={createQueryClient()}>
      <JotaiProvider store={store}>
        <LessonCardField
          params={item}
          content={{
            index: 0,
            startedAt: 0,
            form: { data: {}, isSubmitted },
            card: createCard({ content: { [field.id]: { text: "Hidden answer" } } }),
            template: { id: testId(1), layout: [item] },
            grades: [],
          }}
          onFormChange={() => {}}
          onSubmit={() => {}}
        />
      </JotaiProvider>
    </QueryClientProvider>,
  );

  return container.firstElementChild;
}

describe("LessonCardField", () => {
  it.each([
    { operation: "reveal", type: "text", isSubmitted: false, isInert: true },
    { operation: "reveal", type: "text", isSubmitted: true, isInert: false },
    { operation: "type", type: "markdown", isSubmitted: false, isInert: true },
    { operation: "type", type: "markdown", isSubmitted: true, isInert: false },
    { operation: "display", type: "text", isSubmitted: false, isInert: false },
  ] as const)(
    "keeps a $type $operation field out of reach before submit: submitted $isSubmitted → inert $isInert",
    ({ operation, type, isSubmitted, isInert }) => {
      expect(renderField(operation, type, isSubmitted)?.hasAttribute("inert")).toBe(isInert);
    },
  );
});
