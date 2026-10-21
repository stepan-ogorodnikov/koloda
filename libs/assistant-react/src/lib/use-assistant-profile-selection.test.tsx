import type { AIModel, AIProfile, AIRuntime } from "@koloda/ai";
import { aiRuntimeAtom, queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { WritableAtom } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createAIModel, createAIProfile } from "../test/test-helpers";
import { aiProfileStateAtom } from "./state/ai-profile-state";
import type { AIProfileState } from "./state/ai-profile-state";
import { useAssistantProfileSelection } from "./use-assistant-profile-selection";

const REASONING_LEVELS = [
  { effort: "low", description: "Low" },
  { effort: "high", description: "High" },
];

const profileA = createAIProfile({ id: "profile-a", createdAt: new Date(1) });
const profileB = createAIProfile({ id: "profile-b", createdAt: new Date(2) });
const modelOne = createAIModel({ id: "model-1", name: "One", supported_reasoning_levels: REASONING_LEVELS });
const modelTwo = createAIModel({
  id: "model-2",
  name: "Two",
  supported_reasoning_levels: REASONING_LEVELS,
  default_reasoning_level: "low",
});

type HarnessOptions = {
  profiles: AIProfile[];
  models: AIModel[];
  stored: AIProfileState | null;
  /** Overrides the profile list fetch, e.g. to hold it on a gated promise. */
  loadProfiles?: () => Promise<AIProfile[]>;
};

function renderSelection({ profiles, models, stored, loadProfiles }: HarnessOptions) {
  const store = createStore();
  store.set(
    queriesAtom as WritableAtom<Queries, [Queries], unknown>,
    {
      getAIProfilesQuery: () => ({
        queryKey: queryKeys.ai.profiles(),
        queryFn: loadProfiles ?? (async () => profiles),
      }),
    } as unknown as Queries,
  );
  store.set(
    aiRuntimeAtom as WritableAtom<AIRuntime, [AIRuntime], unknown>,
    {
      listModels: async () => models,
    } as unknown as AIRuntime,
  );
  store.set(aiProfileStateAtom, stored);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    );
  }

  const hook = renderHook(() => useAssistantProfileSelection(), { wrapper: Wrapper });
  return { ...hook, store };
}

afterEach(() => {
  localStorage.clear();
});

describe("useAssistantProfileSelection without a conversation", () => {
  const storedHigh: AIProfileState = {
    profileId: "profile-a",
    modelId: "model-1",
    modelParameters: { reasoning_effort: "high" },
  };

  it("a model change resets the global model parameters", async () => {
    const { result, store } = renderSelection({
      profiles: [profileA],
      models: [modelOne, modelTwo],
      stored: storedHigh,
    });
    await waitFor(() => expect(result.current.modelId).toBe("model-1"));

    act(() => result.current.handleModelProfileChange({ profileId: "profile-a", modelId: "model-2" }));

    expect(store.get(aiProfileStateAtom)).toEqual({ profileId: "profile-a", modelId: "model-2", modelParameters: {} });
    await waitFor(() => expect(result.current.modelId).toBe("model-2"));
    expect(result.current.modelParameters).toEqual([
      { type: "reasoning_effort", value: "low", levels: REASONING_LEVELS },
    ]);
  });

  it("a profile change resets the global model parameters", async () => {
    const { result, store } = renderSelection({
      profiles: [profileA, profileB],
      models: [modelOne, modelTwo],
      stored: storedHigh,
    });
    await waitFor(() => expect(result.current.modelId).toBe("model-1"));

    act(() => result.current.handleModelProfileChange({ profileId: "profile-b", modelId: "model-2" }));

    expect(store.get(aiProfileStateAtom)).toEqual({ profileId: "profile-b", modelId: "model-2", modelParameters: {} });
  });

  it("a parameter edit writes that value and keeps the profile and model", async () => {
    const { result, store } = renderSelection({ profiles: [profileA], models: [modelOne], stored: storedHigh });
    await waitFor(() => expect(result.current.modelId).toBe("model-1"));

    act(() => result.current.handleModelParameterChange("reasoning_effort", "low"));

    expect(store.get(aiProfileStateAtom)).toEqual({
      profileId: "profile-a",
      modelId: "model-1",
      modelParameters: { reasoning_effort: "low" },
    });
  });
});

describe("useAssistantProfileSelection reconciles the global record on load", () => {
  const storedGone: AIProfileState = {
    profileId: "profile-deleted",
    modelId: "model-1",
    modelParameters: { reasoning_effort: "high" },
  };
  const reconciledToNewest: AIProfileState = { profileId: "profile-b", modelId: null, modelParameters: {} };

  it("falls back to the newest profile when the stored profile is gone", async () => {
    const { result, store } = renderSelection({
      profiles: [profileA, profileB],
      models: [modelOne],
      stored: storedGone,
    });

    await waitFor(() => expect(store.get(aiProfileStateAtom)).toEqual(reconciledToNewest));
    expect(result.current.profileId).toBe("profile-b");
  });

  it("keeps a stored profile that is still available", async () => {
    const stored: AIProfileState = {
      profileId: "profile-a",
      modelId: "model-1",
      modelParameters: { reasoning_effort: "high" },
    };
    const { result, store } = renderSelection({ profiles: [profileA, profileB], models: [modelOne], stored });

    await waitFor(() => expect(result.current.modelId).toBe("model-1"));
    expect(store.get(aiProfileStateAtom)).toEqual(stored);
  });

  it("leaves the stored record alone until the profile list has loaded", async () => {
    let releaseProfiles!: (profiles: AIProfile[]) => void;
    const pendingProfiles = new Promise<AIProfile[]>((resolve) => {
      releaseProfiles = resolve;
    });
    const { store } = renderSelection({
      profiles: [],
      models: [modelOne],
      stored: storedGone,
      loadProfiles: () => pendingProfiles,
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(store.get(aiProfileStateAtom)).toEqual(storedGone);

    await act(async () => {
      releaseProfiles([profileA, profileB]);
      await pendingProfiles;
    });
    await waitFor(() => expect(store.get(aiProfileStateAtom)).toEqual(reconciledToNewest));
  });

  it("writes the newest profile when nothing is stored", async () => {
    const { store } = renderSelection({ profiles: [profileA, profileB], models: [modelOne], stored: null });

    await waitFor(() => expect(store.get(aiProfileStateAtom)).toEqual(reconciledToNewest));
  });
});
