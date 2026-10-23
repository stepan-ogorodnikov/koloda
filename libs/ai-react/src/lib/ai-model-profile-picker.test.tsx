import type { AIModel, AIProfile } from "@koloda/ai";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createAppStoreWrapper } from "../test/test-helpers";
import { AIModelProfilePicker } from "./ai-model-profile-picker";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

const gpt: AIModel = { id: "openai/gpt-4", name: "GPT-4", context_length: 1 };

function profile(overrides: Partial<AIProfile> = {}): AIProfile {
  return {
    id: "profile-1",
    title: "OpenRouter",
    hasSecrets: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    secrets: { provider: "openrouter", apiKey: "key" },
    ...overrides,
  };
}

// Allowlist filtering itself is pinned in filter-profile-models.test.ts; these cases cover what the picker renders.
describe("AIModelProfilePicker", () => {
  it("shows the empty-models row when an empty-allowlist profile finishes loading", async () => {
    let releaseModels!: (models: AIModel[]) => void;
    const pendingModels = new Promise<AIModel[]>((resolve) => {
      releaseModels = resolve;
    });
    render(
      <AIModelProfilePicker
        profiles={[profile({ whitelistModelIds: [], title: "Restricted" })]}
        profileId="profile-1"
        modelId=""
        onChange={() => undefined}
      />,
      { wrapper: createAppStoreWrapper({ listModels: () => pendingModels }) },
    );

    fireEvent.click(screen.getByRole("button", { name: /ai.model-picker.label/ }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("Restricted")).toBeTruthy();
    expect(within(listbox).getByText("ai.model-picker.loading.label")).toBeTruthy();

    await act(async () => {
      releaseModels([gpt]);
      await pendingModels;
    });

    const loaded = screen.getByRole("listbox");
    expect(await within(loaded).findByText("ai.model-picker.empty-models")).toBeTruthy();
    expect(within(loaded).queryByText("GPT-4")).toBeNull();
  });
});
