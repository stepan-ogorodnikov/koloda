import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient, testId } from "../../test/test-helpers";
import { AddAlgorithm } from "../algorithms/add-algorithm";
import { CloneAlgorithm } from "../algorithms/clone-algorithm";
import { AddTemplate } from "../templates/add-template";
import { CloneTemplate } from "../templates/clone-template";

vi.mock("@tanstack/react-router", () => ({
  Link: () => null,
}));

i18n.loadAndActivate({ locale: "en", messages: {} });

type DialogCase = {
  name: string;
  messagePrefix: string;
  mutation: "addAlgorithmMutation" | "addTemplateMutation" | "cloneAlgorithmMutation" | "cloneTemplateMutation";
  dialog: ReactNode;
};

const DIALOGS: DialogCase[] = [
  { name: "AddAlgorithm", messagePrefix: "add-algorithm", mutation: "addAlgorithmMutation", dialog: <AddAlgorithm /> },
  { name: "AddTemplate", messagePrefix: "add-template", mutation: "addTemplateMutation", dialog: <AddTemplate /> },
  {
    name: "CloneAlgorithm",
    messagePrefix: "clone-algorithm",
    mutation: "cloneAlgorithmMutation",
    dialog: <CloneAlgorithm id={testId(1)} />,
  },
  {
    name: "CloneTemplate",
    messagePrefix: "clone-template",
    mutation: "cloneTemplateMutation",
    dialog: <CloneTemplate id={testId(1)} />,
  },
];

describe("add and clone dialogs", () => {
  it.each(DIALOGS)("$name does not start a second write while the first is pending", async (row) => {
    const write = vi.fn((_data: unknown) => new Promise<never>(() => {}));
    const queries = {
      getSettingsQuery: (name: "hotkeys") => ({ queryKey: queryKeys.settings.detail(name), queryFn: async () => null }),
      [row.mutation]: () => ({ mutationFn: write }),
    } as unknown as Queries;
    const store = createStore();
    store.set(queriesAtom, queries);
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={createQueryClient()}>
          <JotaiProvider store={store}>{row.dialog}</JotaiProvider>
        </QueryClientProvider>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: `${row.messagePrefix}.trigger` }));
    const title = await screen.findByRole("textbox", { name: new RegExp(`${row.messagePrefix}.inputs.title.label`) });
    fireEvent.change(title, { target: { value: "Copy" } });
    const form = title.closest("form")!;

    fireEvent.submit(form);
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    fireEvent.submit(form);
    await act(async () => {});

    expect(write).toHaveBeenCalledTimes(1);
  });
});
