import { queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { useAppForm } from "@koloda/ui";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { describe, expect, it } from "vitest";
import { CardContentTextArea } from "./card-content-text-area";

i18n.loadAndActivate({ locale: "en", messages: {} });

function MarkdownField() {
  const form = useAppForm({ defaultValues: { text: "" } });
  return (
    <form.AppField name="text">
      {(field) => (
        <field.TextField aria-label="Back">
          <CardContentTextArea fieldType="markdown" />
        </field.TextField>
      )}
    </form.AppField>
  );
}

describe("CardContentTextArea", () => {
  // WHY: the picker's hidden file input sits inside the field; it must not take the field's value,
  // since a file input throws when its value is set to anything but an empty string.
  it("keeps a markdown field editable", () => {
    const store = createStore();
    store.set(queriesAtom, { addAttachmentMutation: () => ({ mutationFn: async () => null }) } as unknown as Queries);

    const { container } = render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={new QueryClient()}>
          <JotaiProvider store={store}>
            <MarkdownField />
          </JotaiProvider>
        </QueryClientProvider>
      </I18nProvider>,
    );
    const textarea = screen.getByRole("textbox", { name: "Back" });

    fireEvent.change(textarea, { target: { value: "![logo](data:image/gif;base64,R0lGODlhAQABAAAAACw=)" } });

    expect(textarea).toHaveProperty("value", "![logo](data:image/gif;base64,R0lGODlhAQABAAAAACw=)");
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')?.value).toBe("");
  });
});
