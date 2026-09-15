import { queriesAtom } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AssistantSettings } from "./assistant-settings";

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

function buildQueries(): Queries {
  return {
    getSettingsQuery: (name) => ({
      queryKey: ["settings", name],
      queryFn: async () => ({
        content: { assistant: { temperature: 0.2, chatPromptTemplate: null } },
      }),
    }),
    patchSettingsMutation: () => ({ mutationFn: async () => undefined }),
  } as unknown as Queries;
}

function Wrapper({ children }: { children: ReactNode }) {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], buildQueries());
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider store={store}>{children}</JotaiProvider>
    </QueryClientProvider>
  );
}

describe("AssistantSettings", () => {
  it("does not show a dialog when closed", () => {
    render(<AssistantSettings isOpen={false} onOpenChange={vi.fn()} />, { wrapper: Wrapper });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the settings form in a dialog when open", async () => {
    render(<AssistantSettings isOpen={true} onOpenChange={vi.fn()} />, { wrapper: Wrapper });

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "assistant.settings.title" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "assistant.settings.system-prompt.label" })).toBeTruthy();
  });
});
