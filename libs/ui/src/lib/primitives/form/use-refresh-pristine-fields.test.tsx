import { TextField, useAppForm, useRefreshPristineFields } from "@koloda/ui";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

i18n.loadAndActivate({ locale: "en", messages: {} });

type Entity = { title: string; content: { fields: { title: string }[]; layout: string } };

const PATHS = ["title", "content"] as const;

type EntityFormProps = { latest: Entity; onSubmit: (value: Entity) => void };

function EntityForm({ latest, onSubmit }: EntityFormProps) {
  const form = useAppForm({ defaultValues: latest, onSubmit: ({ value }) => onSubmit(value) });
  useRefreshPristineFields(form, latest, PATHS);

  return (
    <I18nProvider i18n={i18n}>
      <form.AppField name="title">
        {(field) => (
          <field.TextField aria-label="Title">
            <TextField.Input />
          </field.TextField>
        )}
      </form.AppField>
      <form.AppField name="content.fields[0].title">
        {(field) => (
          <field.TextField aria-label="Field title">
            <TextField.Input />
          </field.TextField>
        )}
      </form.AppField>
      <form.AppField name="content.layout">
        {(field) => (
          <field.TextField aria-label="Layout">
            <TextField.Input />
          </field.TextField>
        )}
      </form.AppField>
      <button type="button" onClick={() => form.handleSubmit()}>
        Save
      </button>
    </I18nProvider>
  );
}

function entity(title: string, fieldTitle: string, layout: string): Entity {
  return { title, content: { fields: [{ title: fieldTitle }], layout } };
}

function input(name: string) {
  return screen.getByRole<HTMLInputElement>("textbox", { name });
}

function edit(name: string, value: string) {
  fireEvent.change(input(name), { target: { value } });
}

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });
}

describe("useRefreshPristineFields", () => {
  it("shows new data in groups the user did not change and keeps the user's edits", async () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<EntityForm latest={entity("Original", "Front", "a")} onSubmit={onSubmit} />);
    edit("Layout", "edited");

    rerender(<EntityForm latest={entity("Renamed on B", "Front", "a")} onSubmit={onSubmit} />);
    await act(async () => {});

    expect(input("Title").value).toBe("Renamed on B");
    expect(input("Layout").value).toBe("edited");
    await save();
    expect(onSubmit).toHaveBeenCalledWith(entity("Renamed on B", "Front", "edited"));
  });

  it("keeps a whole group when the user edited a value nested inside it", async () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<EntityForm latest={entity("Original", "Front", "a")} onSubmit={onSubmit} />);
    edit("Field title", "Question");

    rerender(<EntityForm latest={entity("Original", "Front", "b")} onSubmit={onSubmit} />);
    await act(async () => {});

    expect(input("Field title").value).toBe("Question");
    expect(input("Layout").value).toBe("a");
  });

  it("follows new data in a field the user changed and then changed back", async () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<EntityForm latest={entity("Original", "Front", "a")} onSubmit={onSubmit} />);
    edit("Title", "Draft");
    edit("Title", "Original");
    edit("Layout", "edited");

    rerender(<EntityForm latest={entity("Renamed on B", "Front", "a")} onSubmit={onSubmit} />);
    await act(async () => {});

    expect(input("Title").value).toBe("Renamed on B");
  });
});
