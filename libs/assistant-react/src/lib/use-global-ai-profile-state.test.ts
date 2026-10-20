import { act, renderHook } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { createElement } from "react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { aiProfileStateAtom } from "./state/ai-profile-state";
import { useRememberLastUsedAIProfile } from "./use-global-ai-profile-state";

afterEach(() => {
  localStorage.clear();
});

describe("useRememberLastUsedAIProfile", () => {
  it("updates the profile and model on run start and keeps the stored parameters", () => {
    const store = createStore();
    store.set(aiProfileStateAtom, {
      profileId: "profile-a",
      modelId: "model-1",
      modelParameters: { reasoning_effort: "high" },
    });
    const wrapper = ({ children }: PropsWithChildren) => createElement(JotaiProvider, { store }, children);
    const { result } = renderHook(() => useRememberLastUsedAIProfile(), { wrapper });

    act(() => result.current("profile-b", "model-2"));

    expect(store.get(aiProfileStateAtom)).toEqual({
      profileId: "profile-b",
      modelId: "model-2",
      modelParameters: { reasoning_effort: "high" },
    });
  });
});
