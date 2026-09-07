import type { AddAIProfileData } from "@koloda/ai";
import { AppError } from "@koloda/app";
import { aiProvidersAtom, queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsAIAddProfile } from "./settings-ai-add-profile";

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

const addProfile = vi.hoisted(() => vi.fn(async (_data: AddAIProfileData) => undefined));

function buildQueries(): Queries {
  return {
    getSettingsQuery: () => ({
      queryKey: ["settings", "hotkeys"],
      queryFn: async () => null,
    }),
    addAIProfileMutation: () => ({
      mutationFn: async (data: AddAIProfileData) => addProfile(data),
    }),
  } as unknown as Queries;
}

function renderDialog() {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
  store.set(aiProvidersAtom, ["openrouter"]);
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

  return render(<SettingsAIAddProfile />, { wrapper: Wrapper });
}

describe("SettingsAIAddProfile", () => {
  beforeEach(() => {
    addProfile.mockClear();
  });

  it("shows the catalog message and keeps AppError details behind the details control", async () => {
    addProfile.mockRejectedValueOnce(new AppError("db.add", "SQLITE_BUSY"));
    renderDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "settings.ai.add" }));
    });

    fireEvent.change(screen.getByLabelText("settings.ai.profiles.api-key.label"), {
      target: { value: "test-key" },
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "settings.ai.add.submit" }));
    });

    const message = await screen.findByText("db.add");
    expect(message.closest("div")?.className).toContain("flex-row");
    expect(screen.queryByText("SQLITE_BUSY")).toBeNull();

    const trigger = screen.getByRole("button", { name: "error.details" });
    fireEvent.click(trigger);

    expect(await screen.findByText("SQLITE_BUSY")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
