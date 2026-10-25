import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type { Template } from "@koloda/srs";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { describe, expect, it } from "vitest";
import { createCard, createQueryClient, createTemplate, testId } from "../../test/test-helpers";
import { CardPreview } from "./card-preview";

i18n.loadAndActivate({ locale: "en", messages: {} });

function createPreviewTemplate(backOperation: "reveal" | "type") {
  return createTemplate({
    content: {
      fields: [
        { id: testId(201), title: "Front", type: "text", isRequired: true },
        { id: testId(202), title: "Back", type: "text", isRequired: true },
      ],
      layout: [
        { field: testId(201), operation: "display" },
        { field: testId(202), operation: backOperation },
      ],
    },
  });
}

function setup(template: Template) {
  const card = createCard({
    templateId: template.id,
    content: { [testId(201)]: { text: "question" }, [testId(202)]: { text: "answer" } },
  });
  const queries = {
    getTemplateQuery: (id: string) => ({ queryKey: queryKeys.templates.detail(id), queryFn: async () => template }),
    getSettingsQuery: (name: "hotkeys") => ({ queryKey: queryKeys.settings.detail(name), queryFn: async () => null }),
  } as unknown as Queries;
  const store = createStore();
  store.set(queriesAtom, queries);

  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={createQueryClient()}>
        <JotaiProvider store={store}>
          <CardPreview isOpen onOpenChange={() => {}} card={card} templateId={template.id} />
        </JotaiProvider>
      </QueryClientProvider>
    </I18nProvider>,
  );
}

function continueButton() {
  return screen.queryByRole("button", { name: "lesson.content.submit" });
}

async function pressSpace(target: Element) {
  await act(async () => {
    fireEvent.keyDown(target, { key: " ", code: "Space" });
  });
}

describe("CardPreview", () => {
  it("focuses Continue and submits on Space when the card has no type field", async () => {
    setup(createPreviewTemplate("reveal"));
    await waitFor(() => expect(document.activeElement).toBe(continueButton()));

    // Space anywhere outside a text field submits, not only on the focused button.
    (document.activeElement as HTMLElement).blur();
    await pressSpace(document.body);

    await waitFor(() => expect(continueButton()).toBeNull());
  });

  it("does not submit on Space typed in a type field", async () => {
    setup(createPreviewTemplate("type"));
    const field = await screen.findByRole("textbox", { name: "Back" });

    await pressSpace(field);

    expect(continueButton()).not.toBeNull();
  });
});
