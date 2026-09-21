import type { DeleteConversationData } from "@koloda/app";
import { queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conversationsAtom } from "../state/conversation-store";
import { ConversationHeaderMenu } from "./conversation-header-menu";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

const deleteFromDb = vi.hoisted(() => vi.fn(async (_data: DeleteConversationData) => undefined));

vi.mock("../persistence/conversation-write-adapter", () => ({
  deleteAssistantConversation: async ({
    conversationId,
    deleteFromDb: remove,
  }: {
    conversationId: string;
    deleteFromDb: (id: string) => Promise<unknown>;
  }) => {
    await remove(conversationId);
  },
}));

function buildQueries(): Queries {
  return {
    getSettingsQuery: () => ({
      queryKey: ["settings", "hotkeys"],
      queryFn: async () => null,
    }),
    deleteConversationMutation: () => ({
      mutationFn: async (data: DeleteConversationData) => deleteFromDb(data),
    }),
  } as unknown as Queries;
}

function renderMenu(state: Record<string, unknown>, hasTurns: boolean) {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
  store.set(conversationsAtom, {
    c1: {
      messages: hasTurns ? [{ id: "m1", role: "user", content: "hi" }] : [],
      runs: hasTurns ? { r1: { status: "success" } } : {},
      activeRunId: null,
      promptInput: "",
    },
  } as never);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  }

  const onActiveDeleted = vi.fn();
  render(<ConversationHeaderMenu conversationId="c1" onActiveDeleted={onActiveDeleted} />, { wrapper: Wrapper });
  return { onActiveDeleted };
}

describe("ConversationHeaderMenu", () => {
  beforeEach(() => {
    deleteFromDb.mockClear();
  });

  it("deletes without confirmation when the conversation has no submitted turn", async () => {
    const store = createStore();
    store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
    store.set(conversationsAtom, {
      c1: {
        messages: [],
        runs: {},
        activeRunId: "r1",
        promptInput: "",
      },
    } as never);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    function Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    }

    const onActiveDeleted = vi.fn();
    render(<ConversationHeaderMenu conversationId="c1" onActiveDeleted={onActiveDeleted} />, { wrapper: Wrapper });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ai.conversation.menu.trigger" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ai.conversation.delete.action" }));
    });

    await waitFor(() => {
      expect(deleteFromDb).toHaveBeenCalledWith({ id: "c1" });
    });
    expect(onActiveDeleted).toHaveBeenCalled();
  });

  it("asks for confirmation before deleting a conversation with turns", async () => {
    renderMenu({}, true);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ai.conversation.menu.trigger" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ai.conversation.delete.action" }));
    });

    expect(await screen.findByText("ai.conversation.delete.message")).toBeTruthy();
    expect(deleteFromDb).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ai.conversation.delete.confirm" }));
    });

    await waitFor(() => {
      expect(deleteFromDb).toHaveBeenCalledWith({ id: "c1" });
    });
  });
});
