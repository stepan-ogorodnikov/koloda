import type { ConversationListItem } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type * as KolodaUi from "@koloda/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

  it("names the working marker for assistive technology", async () => {
    renderList([items()[1]!], (store) => {
      store.set(
        upsertConversationAtom,
        makeConversation("sent", { runs: { r1: makeRun("r1", "streaming") }, activeRunId: "r1" }),
      );
    });

    expect(await screen.findByRole("img", { name: "ai.conversation.running" })).toBeTruthy();
  });

  it("shows a saved unread flag for a conversation that is not loaded", async () => {
    renderList([{ ...items()[1]!, isUnread: true }]);

    expect(await screen.findByRole("img", { name: "ai.conversation.unread" })).toBeTruthy();
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
    expect(screen.queryByRole("img", { name: "ai.conversation.unread" })).toBeNull();
  });

  it("treats a row as submitted once its loaded conversation has a turn, before the list refreshes", async () => {
    // WHY: The first save after a submit can wait for the stream throttle; until
    // then the cached row still says draft.
    renderList([items()[0]!], (store) => {
      store.set(
        upsertConversationAtom,
        makeConversation("draft", {
          messages: [
            {
              id: "user-r1",
              role: "user",
              parts: [{ type: "text", text: "soon" }],
              metadata: { createdAt: "2026-07-01T11:00:00.000Z", runId: "r1" },
            },
          ],
          runs: { r1: makeRun("r1", "streaming") },
          activeRunId: "r1",
        }),
      );
    });

    const title = await screen.findByText("soon");
    expect(title.getAttribute("data-has-turns")).toBe("true");
    expect(title.className).not.toContain("fg-level-4");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ai.conversation.delete.trigger" }));
    });
    expect(await screen.findByText("ai.conversation.delete.message")).toBeTruthy();
  });
});
