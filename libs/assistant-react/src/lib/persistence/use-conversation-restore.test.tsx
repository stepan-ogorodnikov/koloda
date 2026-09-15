import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import * as React from "react";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import { conversationsAtom } from "../state/conversation-store";
import { useConversationRestore } from "./use-conversation-restore";

function buildQueries(): Queries {
  return {
    // WHY: The backends resolve null for an id with no row (deleted elsewhere,
    // stale localStorage pointer, DB reset) — never an error.
    getConversationQuery: (id: string) => ({
      queryKey: queryKeys.conversations.detail(id),
      queryFn: async () => null,
    }),
  } as unknown as Queries;
}

function createTestWrapper() {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return {
    store,
    Wrapper: function Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      );
    },
  };
}

type RestoreProbeProps = { conversationId: string };

// WHY: Renders the hook output only. The probe must NOT subscribe to
// conversationsAtom itself: the production chat does not, and an extra
// subscription would schedule the re-render whose absence is the bug.
function RestoreProbe({ conversationId }: RestoreProbeProps) {
  const { isRestoring } = useConversationRestore({ conversationId });
  return <div data-testid="restoring">{String(isRestoring)}</div>;
}

describe("useConversationRestore", () => {
  it("upserts a fresh conversation when the stored id has no row and leaves the restoring state", async () => {
    const { store, Wrapper } = createTestWrapper();
    render(
      <React.StrictMode>
        <RestoreProbe conversationId="gone" />
      </React.StrictMode>,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId("restoring").textContent).toBe("true");

    await waitFor(() => expect(screen.getByTestId("restoring").textContent).toBe("false"));

    const restored = store.get(conversationsAtom)["gone"];
    expect(restored?.id).toBe("gone");
    expect(restored?.messages).toHaveLength(0);
  });
});
