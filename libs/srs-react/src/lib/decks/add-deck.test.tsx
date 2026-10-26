import { defaultAlgorithmAtom, defaultTemplateAtom, queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type { Deck, InsertDeckData } from "@koloda/srs";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { createAlgorithm, createQueryClient, createTemplate, testId } from "../../test/test-helpers";
import { AddDeck } from "./add-deck";

vi.mock("@tanstack/react-router", () => ({
  Link: () => null,
}));

i18n.loadAndActivate({ locale: "en", messages: {} });

function setup() {
  const defaultAlgorithm = createAlgorithm({ id: testId(1), title: "Default FSRS" });
  const customAlgorithm = createAlgorithm({ id: testId(2), title: "Custom FSRS" });
  const defaultTemplate = createTemplate({ id: testId(3), title: "Default" });
  const addDeck = vi.fn((_data: InsertDeckData) => new Promise<Deck>(() => {}));
  const queries = {
    getAlgorithmsQuery: () => ({
      queryKey: queryKeys.algorithms.all(),
      queryFn: async () => [defaultAlgorithm, customAlgorithm],
    }),
    getTemplatesQuery: () => ({ queryKey: queryKeys.templates.all(), queryFn: async () => [defaultTemplate] }),
    getSettingsQuery: (name: "hotkeys") => ({ queryKey: queryKeys.settings.detail(name), queryFn: async () => null }),
    addDeckMutation: () => ({ mutationFn: addDeck }),
  } as unknown as Queries;
  const store = createStore();
  store.set(queriesAtom, queries);
  store.set(defaultAlgorithmAtom, defaultAlgorithm.id);
  store.set(defaultTemplateAtom, defaultTemplate.id);

  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={createQueryClient()}>
        <JotaiProvider store={store}>
          <AddDeck />
        </JotaiProvider>
      </QueryClientProvider>
    </I18nProvider>,
  );

  return { defaultAlgorithm, customAlgorithm, defaultTemplate, addDeck };
}

async function openAndTypeTitle(title: string) {
  fireEvent.click(screen.getByRole("button", { name: "add-deck.trigger" }));
  fireEvent.change(await screen.findByLabelText("add-deck.inputs.title.label"), { target: { value: title } });
  // WHY: the pickers render nothing until their lists load.
  await screen.findByRole("button", { name: /template-picker.label/ });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "add-deck.submit" }));
}

// WHY: rendered without StrictMode on purpose. Both e2e suites serve dev builds, where
// StrictMode re-runs the pickers' effects; that hid empty default ids from every e2e add.
describe("AddDeck", () => {
  it("adds with the default preset and template when the user only types a title", async () => {
    const { defaultAlgorithm, defaultTemplate, addDeck } = setup();
    await openAndTypeTitle("German");

    submit();

    await waitFor(() => expect(addDeck).toHaveBeenCalledTimes(1));
    expect(addDeck.mock.calls[0][0]).toEqual({
      title: "German",
      algorithmId: defaultAlgorithm.id,
      templateId: defaultTemplate.id,
    });
  });

  it("keeps the default template when the user picks only another preset", async () => {
    const { customAlgorithm, defaultTemplate, addDeck } = setup();
    await openAndTypeTitle("German");
    fireEvent.click(screen.getByRole("button", { name: /algorithm-picker.label/ }));
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: customAlgorithm.title }));

    submit();

    await waitFor(() => expect(addDeck).toHaveBeenCalledTimes(1));
    expect(addDeck.mock.calls[0][0]).toEqual({
      title: "German",
      algorithmId: customAlgorithm.id,
      templateId: defaultTemplate.id,
    });
  });

  it("does not start a second add while the first is pending", async () => {
    const { addDeck } = setup();
    await openAndTypeTitle("German");
    const form = screen.getByLabelText("add-deck.inputs.title.label").closest("form")!;

    fireEvent.submit(form);
    await waitFor(() => expect(addDeck).toHaveBeenCalledTimes(1));
    fireEvent.submit(form);
    await act(async () => {});

    expect(addDeck).toHaveBeenCalledTimes(1);
  });
});
