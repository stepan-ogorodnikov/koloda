import type { AIProfile, RemoveAIProfileData } from "@koloda/ai";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsAIDeleteProfile } from "./settings-ai-delete-profile";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

vi.mock("@koloda/core-react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAppHotkey: () => {},
    useHotkeysSettings: () => ({
      ui: { close: ["Escape"] },
      form: { submit: ["Control+Enter"], reset: ["Escape"] },
    }),
  };
});

const removeProfile = vi.hoisted(() => vi.fn(async (_data: RemoveAIProfileData) => undefined));

const profile: AIProfile = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "OpenRouter",
  secrets: { provider: "openrouter", apiKey: null },
  hasSecrets: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function buildQueries(): Queries {
  return {
    getSettingsQuery: () => ({
      queryKey: ["settings", "hotkeys"],
      queryFn: async () => null,
    }),
    removeAIProfileMutation: () => ({
      mutationFn: async (data: RemoveAIProfileData) => removeProfile(data),
    }),
  } as unknown as Queries;
}

function renderPopover() {
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

  return { ...render(<SettingsAIDeleteProfile profile={profile} />, { wrapper: Wrapper }), queryClient };
}

async function confirmDelete() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "settings.ai.profiles.delete.trigger" }));
  });
  await act(async () => {
    fireEvent.click(await screen.findByRole("button", { name: "settings.ai.delete.confirm" }));
  });
}

describe("SettingsAIDeleteProfile", () => {
  beforeEach(() => {
    removeProfile.mockReset();
    removeProfile.mockResolvedValue(undefined);
  });

  it("drops the profile's cached model list after a delete", async () => {
    const { queryClient } = renderPopover();
    queryClient.setQueryData(queryKeys.ai.models(profile.id), [{ id: "m", name: "Model", context_length: 0 }]);

    await confirmDelete();

    expect(removeProfile).toHaveBeenCalledWith({ id: profile.id });
    expect(queryClient.getQueryState(queryKeys.ai.models(profile.id))).toBeUndefined();
  });
});
