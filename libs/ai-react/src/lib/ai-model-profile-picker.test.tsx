import type { AIModel, AIProfile } from "@koloda/ai";
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { AIModelProfilePicker } from "./ai-model-profile-picker";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@koloda/ui", () => {
  const Select = Object.assign(
    ({
      items,
      children,
      emptyContent,
    }: {
      items: unknown[];
      children: (item: unknown) => React.ReactNode;
      emptyContent?: React.ReactNode;
    }) => <div>{items.length === 0 ? emptyContent : items.map((item) => children(item))}</div>,
    {
      ListBoxSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Header: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Collection: ({ items, children }: { items: unknown[]; children: (item: unknown) => React.ReactNode }) => (
        <div>{items.map((item) => children(item))}</div>
      ),
      ListBoxItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    },
  );

  return {
    Select,
    Fade: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Button: (props: { children: React.ReactNode }) => <button type="button">{props.children}</button>,
    Tooltip: ({ children }: { children: React.ReactNode }) => children,
  };
});

const gpt: AIModel = { id: "openai/gpt-4", name: "GPT-4", context_length: 1 };
const claude: AIModel = { id: "anthropic/claude", name: "Claude", context_length: 1 };
const gemini: AIModel = { id: "google/gemini", name: "Gemini", context_length: 1 };

vi.mock("./use-ai-profiles-models", () => ({
  useAIProfilesModels: () => ({
    byProfileId: {
      "profile-1": {
        profileId: "profile-1",
        models: [gpt, claude, gemini],
        isLoading: false,
        isError: false,
        error: null,
        refetch: () => undefined,
      },
    },
    states: [],
  }),
}));

function profile(overrides: Partial<AIProfile> = {}): AIProfile {
  return {
    id: "profile-1",
    title: "OpenRouter",
    hasSecrets: true,
    createdAt: "2026-01-01T00:00:00Z",
    secrets: { provider: "openrouter", apiKey: "key" },
    ...overrides,
  };
}

describe("AIModelProfilePicker allowlist", () => {
  it("shows every model when the allowlist is unset", () => {
    render(
      <AIModelProfilePicker
        profiles={[profile()]}
        profileId="profile-1"
        modelId="openai/gpt-4"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByText("GPT-4")).toBeTruthy();
    expect(screen.getByText("Claude")).toBeTruthy();
    expect(screen.getByText("Gemini")).toBeTruthy();
  });

  it("filters models by whitelistModelIds", () => {
    render(
      <AIModelProfilePicker
        profiles={[profile({ whitelistModelIds: ["openai/gpt-4", "google/gemini"] })]}
        profileId="profile-1"
        modelId="openai/gpt-4"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByText("GPT-4")).toBeTruthy();
    expect(screen.getByText("Gemini")).toBeTruthy();
    expect(screen.queryByText("Claude")).toBeNull();
  });

  it("keeps the selected model visible when it is not allowlisted", () => {
    render(
      <AIModelProfilePicker
        profiles={[profile({ whitelistModelIds: ["openai/gpt-4"] })]}
        profileId="profile-1"
        modelId="anthropic/claude"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByText("GPT-4")).toBeTruthy();
    expect(screen.getByText("Claude")).toBeTruthy();
    expect(screen.queryByText("Gemini")).toBeNull();
  });

  it("shows an empty-models state for an empty allowlist without hiding the profile", () => {
    render(
      <AIModelProfilePicker
        profiles={[profile({ whitelistModelIds: [], title: "Restricted" })]}
        profileId="profile-1"
        modelId=""
        onChange={() => undefined}
      />,
    );

    expect(screen.getByText("Restricted")).toBeTruthy();
    expect(screen.getByText("ai.model-picker.empty-models")).toBeTruthy();
    expect(screen.queryByText("GPT-4")).toBeNull();
  });

  it("hides stale allowlist ids", () => {
    render(
      <AIModelProfilePicker
        profiles={[profile({ whitelistModelIds: ["openai/gpt-4", "gone/model"] })]}
        profileId="profile-1"
        modelId="openai/gpt-4"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByText("GPT-4")).toBeTruthy();
    expect(screen.queryByText("gone/model")).toBeNull();
  });
});
