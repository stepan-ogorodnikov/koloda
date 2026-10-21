import type { ConversationListItem } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type * as KolodaUi from "@koloda/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { makeConversation, makeRun } from "../state/assistant-conversation.fixtures";
import { upsertConversationAtom } from "../state/conversation-store";
import { AssistantConversationsList } from "./assistant-conversations-list";

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
    { id: "draft", title: "soon", createdAt, updatedAt: createdAt, hasTurns: false, isUnread: false },
    { id: "sent", title: "hello", createdAt, updatedAt: createdAt, hasTurns: true, isUnread: false },
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

function renderList(list: ConversationListItem[], setup?: (store: ReturnType<typeof createStore>) => void) {
  const store = createStore();
  setup?.(store);
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

  it("shows a saved unread flag for a conversation that is not loaded", async () => {
    renderList([{ ...items()[1]!, isUnread: true }]);

    expect(await screen.findByLabelText("ai.conversation.unread")).toBeTruthy();
  });

  it("prefers live read state over a stale saved unread flag", async () => {
    // WHY: Opening a conversation marks it read in the store before the next
    // save refreshes the cached row.
    renderList([{ ...items()[1]!, isUnread: true }], (store) => {
      store.set(
        upsertConversationAtom,
        makeConversation("sent", { runs: { r1: makeRun("r1", "success") }, lastReadRunId: "r1" }),
      );
    });

    await screen.findByText("hello");
    expect(screen.queryByLabelText("ai.conversation.unread")).toBeNull();
  });
});
