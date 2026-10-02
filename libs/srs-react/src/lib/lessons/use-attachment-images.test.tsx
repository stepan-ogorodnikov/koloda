import { queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { markdownToHtml } from "@koloda/srs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { useAttachmentImages } from "./use-attachment-images";

type MarkdownProps = { html: string };

function Markdown({ html }: MarkdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  useAttachmentImages(ref, html);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}

describe("useAttachmentImages", () => {
  it("shows a missing attachment as its alt text, not an image without a source", async () => {
    const store = createStore();
    store.set(queriesAtom, {
      getAttachmentQuery: (id: string) => ({ queryKey: ["attachments", id], queryFn: async () => null }),
    } as unknown as Queries);
    const html = markdownToHtml(`![missing](attachment:${"0".repeat(64)})`, { shouldKeepAttachmentImages: true });

    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <JotaiProvider store={store}>
          <Markdown html={html} />
        </JotaiProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(container.querySelector("img")).toBeNull());
    expect(container.textContent).toBe("missing\n");
  });
});
