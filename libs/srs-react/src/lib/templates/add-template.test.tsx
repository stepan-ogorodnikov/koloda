import { SEED_TEMPLATE_TYPE_BACK_FIELD_ID, SEED_TEMPLATE_TYPE_FRONT_FIELD_ID } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type { InsertTemplateData } from "@koloda/srs";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient, testId } from "../../test/test-helpers";
import { AddTemplate } from "./add-template";

vi.mock("@tanstack/react-router", () => ({
  Link: () => null,
}));

i18n.loadAndActivate({ locale: "en", messages: {} });

function renderAddTemplate() {
  const write = vi.fn(async (_data: InsertTemplateData) => ({ id: testId(write.mock.calls.length) }));
  const queries = {
    getSettingsQuery: (name: "hotkeys") => ({ queryKey: queryKeys.settings.detail(name), queryFn: async () => null }),
    addTemplateMutation: () => ({ mutationFn: write }),
  } as unknown as Queries;
  const store = createStore();
  store.set(queriesAtom, queries);
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={createQueryClient()}>
        <JotaiProvider store={store}>
          <AddTemplate />
        </JotaiProvider>
      </QueryClientProvider>
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "add-template.trigger" }));
  return write;
}

async function submitTitle(title: string) {
  const input = await screen.findByRole("textbox", { name: /add-template.inputs.title.label/ });
  fireEvent.change(input, { target: { value: title } });
  fireEvent.submit(input.closest("form")!);
}

describe("AddTemplate", () => {
  it("gives each template added from one open dialog its own field ids", async () => {
    const write = renderAddTemplate();

    await submitTitle("First");
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    await submitTitle("Second");
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));

    const contents = write.mock.calls.map(([data]) => data.content);
    const fieldIds = contents.flatMap((content) => content.fields.map((field) => field.id));
    const seedIds = [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID, SEED_TEMPLATE_TYPE_BACK_FIELD_ID];
    expect(new Set([...fieldIds, ...seedIds]).size).toBe(fieldIds.length + seedIds.length);
    for (const content of contents) {
      expect(content.layout.map((item) => item.field)).toEqual(content.fields.map((field) => field.id));
    }
  });
});
