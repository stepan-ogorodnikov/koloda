import { fetchedAttachmentsAtom, queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { markdownToHtml } from "@koloda/srs";
import type { AttachmentContent } from "@koloda/srs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAttachmentImages } from "./use-attachment-images";

type MarkdownProps = { html: string };

function Markdown({ html }: MarkdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  useAttachmentImages(ref, html);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}

const MISSING_ID = "0".repeat(64);
const OTHER_ID = "1".repeat(64);

function content(id: string): AttachmentContent {
  return {
    id,
    mime: "image/png",
    size: 1,
    width: 10,
    height: 20,
    createdAt: new Date(0),
    bytes: new Uint8Array([1]),
  };
}

function renderField(stored: Map<string, AttachmentContent>) {
  const store = createStore();
  store.set(queriesAtom, {
    getAttachmentQuery: (id: string) => ({
      queryKey: ["attachments", id],
      queryFn: async () => stored.get(id) ?? null,
    }),
  } as unknown as Queries);
  const html = markdownToHtml(`![missing](attachment:${MISSING_ID})`, { shouldKeepAttachmentImages: true });

  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <JotaiProvider store={store}>
        <Markdown html={html} />
      </JotaiProvider>
    </QueryClientProvider>,
  );
  return { ...view, store };
}

describe("useAttachmentImages", () => {
  beforeEach(() => {
    // WHY: jsdom implements neither object URL function.
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("shows a missing attachment as its alt text, not an image without a source", async () => {
    const { container } = renderField(new Map());

    await waitFor(() => expect(container.querySelector("img")).toBeNull());
    expect(container.textContent).toBe("missing\n");
  });

  it("shows a missing attachment once sync downloads it", async () => {
    const stored = new Map<string, AttachmentContent>();
    const { container, store } = renderField(stored);
    await waitFor(() => expect(container.textContent).toBe("missing\n"));

    stored.set(MISSING_ID, content(MISSING_ID));
    act(() => store.set(fetchedAttachmentsAtom, [MISSING_ID]));

    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:test"));
    expect(container.textContent).toBe("\n");
  });

  it("keeps the alt text when sync downloads other images", async () => {
    const stored = new Map<string, AttachmentContent>();
    const { container, store } = renderField(stored);
    await waitFor(() => expect(container.textContent).toBe("missing\n"));

    stored.set(MISSING_ID, content(MISSING_ID));
    act(() => store.set(fetchedAttachmentsAtom, [OTHER_ID]));

    // WHY: a matched batch puts the `<img>` back at once, before it loads.
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("missing\n");
  });
});
