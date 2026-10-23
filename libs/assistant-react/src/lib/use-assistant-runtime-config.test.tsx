import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { WritableAtom } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import { createQueryClient } from "../test/test-helpers";
import { useAssistantRuntimeConfig } from "./use-assistant-runtime-config";

function renderConfig(content: unknown) {
  const store = createStore();
  store.set(
    queriesAtom as WritableAtom<Queries, [Queries], unknown>,
    {
      getSettingsQuery: (name: string) => ({
        queryKey: queryKeys.settings.detail(name as "ai"),
        queryFn: async () => ({ name, content }),
      }),
    } as unknown as Queries,
  );
  const queryClient = createQueryClient();

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  }

  const hook = renderHook(
    () =>
      useAssistantRuntimeConfig({ profileId: "profile-1", modelId: "model-1", modelName: "M", reasoningEffort: "" }),
    { wrapper: Wrapper },
  );
  return { ...hook, queryClient };
}

describe("useAssistantRuntimeConfig", () => {
  it("gives runs the saved prompt and temperature, and follows a later save", async () => {
    const { result, queryClient } = renderConfig({
      profiles: [],
      assistant: { temperature: 0.7, chatPromptTemplate: "mine", chatPromptMode: "custom" },
    });
    await waitFor(() => expect(result.current.configRef.current.chatPromptTemplate).toBe("mine"));
    expect(result.current.configRef.current.temperature).toBe(0.7);

    act(() => {
      queryClient.setQueryData(queryKeys.settings.detail("ai"), {
        name: "ai",
        content: { profiles: [], assistant: { temperature: 1, chatPromptTemplate: "mine", chatPromptMode: "default" } },
      });
    });

    // The query cache notifies observers asynchronously.
    await waitFor(() =>
      expect(result.current.configRef.current).toMatchObject({ temperature: 1, chatPromptTemplate: null }),
    );
  });

  it("gives runs the built-in prompt and temperature when nothing is saved", async () => {
    const { result, queryClient } = renderConfig({ profiles: [] });
    await waitFor(() => expect(queryClient.getQueryData(queryKeys.settings.detail("ai"))).toBeDefined());

    expect(result.current.configRef.current).toMatchObject({ temperature: 0.2, chatPromptTemplate: null });
  });
});
