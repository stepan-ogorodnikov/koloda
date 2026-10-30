import { addAttachmentFromUrlAtom, queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { useAppForm } from "@koloda/ui";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardContentTextArea } from "./card-content-text-area";

i18n.loadAndActivate({ locale: "en", messages: {} });

const ID = "a".repeat(64);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function useTextForm() {
  return useAppForm({ defaultValues: { text: "" } });
}

type FormApi = ReturnType<typeof useTextForm>;

function MarkdownField({ onForm }: { onForm?: (form: FormApi, hide: () => void) => void }) {
  const form = useTextForm();
  const [isShown, setIsShown] = useState(true);
  onForm?.(form, () => setIsShown(false));
  if (!isShown) return null;
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

function setup(addAttachment: () => Promise<unknown> = async () => null, fromUrl?: (url: string) => Promise<unknown>) {
  const store = createStore();
  store.set(queriesAtom, { addAttachmentMutation: () => ({ mutationFn: addAttachment }) } as unknown as Queries);
  if (fromUrl) store.set(addAttachmentFromUrlAtom, () => fromUrl as never);
  const api = { form: null as unknown as FormApi, hide: () => {} };

  const { container } = render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <JotaiProvider store={store}>
          <MarkdownField
            onForm={(form, hide) => {
              api.form = form;
              api.hide = hide;
            }}
          />
        </JotaiProvider>
      </QueryClientProvider>
    </I18nProvider>,
  );
  const textarea = screen.getByRole("textbox", { name: "Back" }) as HTMLTextAreaElement;
  return { container, textarea, ...api, hide: () => act(() => api.hide()) };
}

function heldAdd() {
  let release: () => Promise<void> = async () => {};
  const add = vi.fn(
    () =>
      new Promise((resolve) => {
        release = () => act(async () => resolve({ id: ID }));
      }),
  );
  return { add, release: () => release() };
}

function drop(textarea: HTMLTextAreaElement, file: File) {
  fireEvent.drop(textarea, { dataTransfer: { files: [file], items: [{ kind: "file", type: file.type }] } });
}

const cat = () => new File([PNG], "cat.png", { type: "image/png" });
const fakePng = () => new File([new TextEncoder().encode("not an image")], "notes.png", { type: "image/png" });

function pasteLink(textarea: HTMLTextAreaElement, url: string) {
  fireEvent.paste(textarea, { clipboardData: { files: [], getData: () => url } });
  fireEvent.change(textarea, { target: { value: url } });
  fireEvent.input(textarea, { inputType: "insertFromPaste" });
}

const embedButton = () => screen.queryByRole("button", { name: "card.content.embed-image" });

beforeEach(() => {
  vi.stubGlobal("createImageBitmap", async () => ({ width: 1, height: 1, close() {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CardContentTextArea", () => {
  // WHY: the picker's hidden file input sits inside the field; it must not take the field's value,
  // since a file input throws when its value is set to anything but an empty string.
  it("keeps a markdown field editable", () => {
    const { container, textarea } = setup();

    fireEvent.change(textarea, { target: { value: "![logo](data:image/gif;base64,R0lGODlhAQABAAAAACw=)" } });

    expect(textarea).toHaveProperty("value", "![logo](data:image/gif;base64,R0lGODlhAQABAAAAACw=)");
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')?.value).toBe("");
  });
});

describe("CardContentTextArea image insertion", () => {
  it("holds the field read-only while storing and inserts at the selection taken at the start", async () => {
    const { add, release } = heldAdd();
    const { form, textarea } = setup(add);
    fireEvent.change(textarea, { target: { value: "front back" } });
    textarea.setSelectionRange(5, 5);

    drop(textarea, cat());
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(textarea.readOnly).toBe(true);
    textarea.setSelectionRange(0, 0);
    await release();

    await waitFor(() => expect(textarea.value).toBe(`front![cat](attachment:${ID}) back`));
    expect(textarea.readOnly).toBe(false);
    expect(form.state.canSubmit).toBe(true);
  });

  it("keeps the form from submitting while an image is stored", async () => {
    const { add, release } = heldAdd();
    const { form, textarea } = setup(add);

    drop(textarea, cat());
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));

    expect(form.state.canSubmit).toBe(false);
    await release();
    await waitFor(() => expect(form.state.canSubmit).toBe(true));
  });

  it("starts nothing on a second drop while an image is stored", async () => {
    const { add, release } = heldAdd();
    const { textarea } = setup(add);

    drop(textarea, cat());
    drop(textarea, cat());
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    await release();

    await waitFor(() => expect(textarea.value).toBe(`![cat](attachment:${ID})`));
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("drops an insertion whose field text was replaced while it was stored", async () => {
    const { add, release } = heldAdd();
    const { form, textarea } = setup(add);

    drop(textarea, cat());
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    act(() => form.setFieldValue("text", "synced"));
    await release();

    await waitFor(() => expect(textarea.readOnly).toBe(false));
    expect(textarea.value).toBe("synced");
  });

  it("drops an insertion whose editor unmounted while it was stored", async () => {
    const { add, release } = heldAdd();
    const { form, textarea, hide } = setup(add);

    drop(textarea, cat());
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    hide();
    await release();

    expect(form.state.values.text).toBe("");
  });
});

describe("CardContentTextArea embed action and errors", () => {
  it("hides the embed action once a form reset replaces the pasted link", async () => {
    const { form, textarea } = setup(undefined, async () => ({ id: ID }));

    pasteLink(textarea, "https://example.test/cat.png");
    await waitFor(() => expect(embedButton()).not.toBeNull());
    act(() => form.reset());

    expect(embedButton()).toBeNull();
  });

  it("hides a rejected file's error once the field is edited", async () => {
    const { textarea } = setup();

    drop(textarea, fakePng());
    await screen.findByRole("alert");
    fireEvent.change(textarea, { target: { value: "edited" } });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hides a rejected file's error after a form reset, even when the field stays empty", async () => {
    const { form, textarea } = setup();

    drop(textarea, fakePng());
    await screen.findByRole("alert");
    act(() => form.reset());

    expect(textarea.value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("CardContentTextArea file types", () => {
  function pick(container: HTMLElement, files: File[]) {
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files } });
  }

  it("inserts an image dropped without an image type", async () => {
    const add = vi.fn(async () => ({ id: ID }));
    const { textarea } = setup(add);

    drop(textarea, new File([PNG], "scan", { type: "" }));

    await waitFor(() => expect(textarea.value).toBe(`![scan](attachment:${ID})`));
  });

  it("skips a non-image dropped without a type, with no error", async () => {
    const add = vi.fn(async () => ({ id: ID }));
    const { textarea } = setup(add);

    fireEvent.drop(textarea, {
      dataTransfer: {
        files: [cat(), new File(["plain text"], "notes", { type: "" })],
        items: [
          { kind: "file", type: "image/png" },
          { kind: "file", type: "" },
        ],
      },
    });

    await waitFor(() => expect(textarea.value).toBe(`![cat](attachment:${ID})`));
    expect(add).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the format error for a picked file that is not an image", async () => {
    const add = vi.fn(async () => ({ id: ID }));
    const { container, textarea } = setup(add);

    pick(container, [new File(["%PDF-1.7"], "doc.pdf", { type: "application/pdf" })]);

    expect((await screen.findByRole("alert")).textContent).toContain("validation.attachments.format");
    expect(add).not.toHaveBeenCalled();
    expect(textarea.value).toBe("");
  });
});
