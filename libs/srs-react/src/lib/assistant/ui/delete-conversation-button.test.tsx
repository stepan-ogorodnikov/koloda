import type { DeleteConversationData } from "@koloda/app";
import { queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteConversationButton } from "./delete-conversation-button";

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

function renderButton(hasTurns: boolean) {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
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

  return render(<DeleteConversationButton id="c1" hasTurns={hasTurns} />, { wrapper: Wrapper });
}

describe("DeleteConversationButton", () => {
  beforeEach(() => {
    deleteFromDb.mockClear();
  });
  it("deletes a draft without asking for confirmation", async () => {
    renderButton(false);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ai.conversation.delete.trigger" }));
    });

    await waitFor(() => {
      expect(deleteFromDb).toHaveBeenCalledWith({ id: "c1" });
    });
    expect(screen.queryByText("ai.conversation.delete.message")).toBeNull();
    expect(screen.queryByRole("button", { name: "ai.conversation.delete.confirm" })).toBeNull();
  });

  it("still asks for confirmation after a turn exists", async () => {
    renderButton(true);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ai.conversation.delete.trigger" }));
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
