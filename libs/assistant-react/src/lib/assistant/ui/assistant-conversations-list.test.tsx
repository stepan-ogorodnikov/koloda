import type { ConversationListItem } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type * as KolodaUi from "@koloda/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AssistantConversationsList } from "./assistant-conversations-list";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

vi.mock("@koloda/ui", async () => {
  const actual = await vi.importActual<typeof KolodaUi>("@koloda/ui");
  return {
    ...actual,
    Link: ({ children, className }: { children?: ReactNode; className?: string }) => (
      <a className={className} href="#ai">
        {children}
      </a>
    ),
  };
});

const createdAt = new Date("2026-07-01T11:00:00.000Z");

function items(): ConversationListItem[] {
  return [
    { id: "draft", title: "soon", createdAt, updatedAt: createdAt, hasTurns: false },
    { id: "sent", title: "hello", createdAt, updatedAt: createdAt, hasTurns: true },
  ];
}

function buildQueries(list: ConversationListItem[]): Queries {
  return {
    getConversationsQuery: () => ({
      queryKey: queryKeys.conversations.all(),
      queryFn: async () => list,
    }),
    getSettingsQuery: () => ({
      queryKey: ["settings", "hotkeys"],
      queryFn: async () => null,
    }),
    deleteConversationMutation: () => ({ mutationFn: async () => undefined }),
  } as unknown as Queries;
}

function renderList(list: ConversationListItem[]) {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries(list));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(queryKeys.conversations.all(), list);

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  }

  return render(<AssistantConversationsList />, { wrapper: Wrapper });
}

describe("AssistantConversationsList", () => {
  it("dims draft titles and leaves turned conversation titles at the default color", async () => {
    renderList(items());

    const draft = await screen.findByText("soon");
    const sent = screen.getByText("hello");

    expect(draft.getAttribute("data-has-turns")).toBe("false");
    expect(draft.className).toContain("fg-level-4");
    expect(sent.getAttribute("data-has-turns")).toBe("true");
    expect(sent.className).not.toContain("fg-level-4");
  });
});
