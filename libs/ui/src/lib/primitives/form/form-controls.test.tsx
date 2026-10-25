import { TextField, useAppForm } from "@koloda/ui";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

i18n.loadAndActivate({ locale: "en", messages: {} });

type TitleFormProps = { onSubmit: () => void };

function TitleForm({ onSubmit }: TitleFormProps) {
  const form = useAppForm({ defaultValues: { title: "Deck" }, onSubmit });

  return (
    <I18nProvider i18n={i18n}>
      <form.AppField name="title">
        {(field) => (
          <field.TextField aria-label="Title">
            <TextField.Input />
          </field.TextField>
        )}
      </form.AppField>
      <form.AppForm>
        <form.Controls />
      </form.AppForm>
    </I18nProvider>
  );
}

async function pressSave() {
  await act(async () => {
    fireEvent.keyDown(document.body, { key: "s", code: "KeyS", ctrlKey: true });
  });
}

describe("Controls", () => {
  it("saves by hotkey only after the form changes", async () => {
    const onSubmit = vi.fn();
    render(<TitleForm onSubmit={onSubmit} />);

    await pressSave();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Renamed" } });
    await pressSave();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
