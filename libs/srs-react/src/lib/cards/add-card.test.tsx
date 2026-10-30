import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type { InsertCardData } from "@koloda/srs";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeck, createQueryClient, createTemplate } from "../../test/test-helpers";
import { AddCard } from "./add-card";

i18n.loadAndActivate({ locale: "en", messages: {} });

const ATTACHMENT_ID = "a".repeat(64);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

beforeEach(() => {
  vi.stubGlobal("createImageBitmap", async () => ({ width: 1, height: 1, close() {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup() {
  const template = createTemplate({ content: { fields: [{}, { type: "markdown" }] } });
  const deck = createDeck({ templateId: template.id });
  let resolveAdd: () => void = () => {};
  const addCard = vi.fn(
    (_data: InsertCardData) =>
      new Promise<void>((resolve) => {
        resolveAdd = resolve;
      }),
  );
  let resolveAttachment: () => void = () => {};
  const addAttachment = vi.fn(
    () =>
      new Promise((resolve) => {
        resolveAttachment = () => resolve({ id: ATTACHMENT_ID });
      }),
  );
  const queries = {
    getTemplateQuery: (id: string) => ({ queryKey: queryKeys.templates.detail(id), queryFn: async () => template }),
    getSettingsQuery: (name: "hotkeys") => ({ queryKey: queryKeys.settings.detail(name), queryFn: async () => null }),
    addCardMutation: () => ({ mutationFn: addCard }),
    addAttachmentMutation: () => ({ mutationFn: addAttachment }),
  } as unknown as Queries;
  const store = createStore();
  store.set(queriesAtom, queries);
  const queryClient = createQueryClient();
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <AddCard deckId={deck.id} templateId={template.id} />
        </JotaiProvider>
      </QueryClientProvider>
    </I18nProvider>,
  );

  return {
    deck,
    addCard,
    resolveAdd: () => act(async () => resolveAdd()),
    addAttachment,
    resolveAttachment: () => act(async () => resolveAttachment()),
    invalidateQueries,
  };
}

async function openAndFill() {
  fireEvent.click(screen.getByRole("button", { name: "add-cards.trigger" }));
  for (const name of ["Front", "Back"]) {
    fireEvent.change(await screen.findByRole("textbox", { name }), { target: { value: `${name} text` } });
  }
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "add-card.submit" }));
}

describe("AddCard", () => {
  it("refreshes the deck after an add that settles once the dialog is closed", async () => {
    const { deck, addCard, resolveAdd, invalidateQueries } = setup();
    await openAndFill();
    submit();
    await waitFor(() => expect(addCard).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await resolveAdd();

    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.cards.deck({ deckId: deck.id }) }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.lessons.all() });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.templates.all() });
  });

  it("does not start a second add while the first is pending", async () => {
    const { addCard, resolveAdd } = setup();
    await openAndFill();
    submit();
    await waitFor(() => expect(addCard).toHaveBeenCalledTimes(1));

    submit();
    await act(() => Promise.resolve());
    await resolveAdd();

    expect(addCard).toHaveBeenCalledTimes(1);
  });

  it("does not add the card while an image is still being stored", async () => {
    const { addCard, addAttachment, resolveAttachment } = setup();
    await openAndFill();
    const back = screen.getByRole("textbox", { name: "Back" });
    const file = new File([PNG], "cat.png", { type: "image/png" });
    fireEvent.drop(back, { dataTransfer: { files: [file], items: [{ kind: "file", type: file.type }] } });
    await waitFor(() => expect(addAttachment).toHaveBeenCalledTimes(1));

    // Both submit doors: the Add button, and the form submit the submit hotkey also runs.
    submit();
    fireEvent.submit(back.closest("form") as HTMLFormElement);
    await act(() => Promise.resolve());
    expect(addCard).not.toHaveBeenCalled();

    await resolveAttachment();
    await waitFor(() => expect(back).toHaveProperty("value", `Back text![cat](attachment:${ATTACHMENT_ID})`));
    submit();

    await waitFor(() => expect(addCard).toHaveBeenCalledTimes(1));
    expect(Object.values(addCard.mock.calls[0][0].content).map((field) => field.text)).toContain(
      `Back text![cat](attachment:${ATTACHMENT_ID})`,
    );
  });
});
