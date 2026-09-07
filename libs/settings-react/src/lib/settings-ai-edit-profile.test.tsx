import type { AIProfile, UpdateAIProfileData } from "@koloda/ai";
import { AppError } from "@koloda/app";
import { queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsAIEditProfile } from "./settings-ai-edit-profile";

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

const updateProfile = vi.hoisted(() => vi.fn(async (_data: UpdateAIProfileData) => undefined));

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
    updateAIProfileMutation: () => ({
      mutationFn: async (data: UpdateAIProfileData) => updateProfile(data),
    }),
  } as unknown as Queries;
}

function renderDialog() {
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

  return render(<SettingsAIEditProfile profile={profile} />, { wrapper: Wrapper });
}

describe("SettingsAIEditProfile", () => {
  beforeEach(() => {
    updateProfile.mockClear();
  });

  it("shows the catalog message and keeps AppError details behind the details control", async () => {
    updateProfile.mockRejectedValueOnce(new AppError("db.update", "SQLITE_BUSY"));
    renderDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "settings.ai.edit.trigger" }));
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "settings.ai.edit.submit" }));
    });

    const message = await screen.findByText("db.update");
    expect(message.closest("div")?.className).toContain("flex-row");
    expect(screen.queryByText("SQLITE_BUSY")).toBeNull();

    const trigger = screen.getByRole("button", { name: "error.details" });
    fireEvent.click(trigger);

    expect(await screen.findByText("SQLITE_BUSY")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
