import type { AssistantSettings as AssistantSettingsType } from "@koloda/ai";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AssistantSettings } from "./assistant-settings";
import type { AssistantSettingsProps } from "./assistant-settings";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

// WHY: NumberFlow's custom element crashes in jsdom on re-render; the slider's
// animated digits are not under test.
vi.mock("@number-flow/react", () => ({
  default: (props: { value?: unknown }) => <span>{String(props.value)}</span>,
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

const savedSettings: AssistantSettingsType = {
  temperature: 0.5,
  chatPromptTemplate: "saved custom prompt",
  chatPromptMode: "custom",
};

// WORKAROUND: jsdom lacks getAnimations; react-aria's SharedElementTransition
// throws on mount without it.
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}

type PatchPayload = { name: string; content: { assistant: AssistantSettingsType } };

function buildQueries({
  saved = savedSettings,
  onPatch,
}: {
  saved?: AssistantSettingsType | null;
  onPatch?: (payload: PatchPayload) => void;
} = {}): Queries {
  return {
    getSettingsQuery: (name) => ({
      queryKey: queryKeys.settings.detail(name),
      queryFn: async () => ({ content: { assistant: saved } }),
    }),
    patchSettingsMutation: () => ({
      mutationFn: async (payload: PatchPayload) => {
        onPatch?.(payload);
        return undefined;
      },
    }),
  } as unknown as Queries;
}

function Wrapper({ children, queries }: { children: ReactNode; queries: Queries }) {
  const store = createStore();
  store.set(queriesAtom as unknown as Parameters<typeof store.set>[0], queries);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider store={store}>{children}</JotaiProvider>
    </QueryClientProvider>
  );
}

// Keeps the component mounted across open/close so a broken reset handler
// cannot hide behind remounting.
function SettingsHost(props: Omit<AssistantSettingsProps, "isOpen">) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        open-settings
      </button>
      <AssistantSettings {...props} isOpen={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}

describe("AssistantSettings", () => {
  it("does not show a dialog when closed", () => {
    render(<AssistantSettings isOpen={false} onOpenChange={vi.fn()} />, {
      wrapper: ({ children }) => <Wrapper queries={buildQueries()}>{children}</Wrapper>,
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the settings form in a dialog when open", async () => {
    render(<AssistantSettings isOpen={true} onOpenChange={vi.fn()} />, {
      wrapper: ({ children }) => <Wrapper queries={buildQueries()}>{children}</Wrapper>,
    });

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "assistant.settings.title" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "assistant.settings.system-prompt.label" })).toBeTruthy();
  });

  it("saves source, template, and temperature together", async () => {
    const onPatch = vi.fn();
    render(<AssistantSettings isOpen={true} onOpenChange={vi.fn()} />, {
      wrapper: ({ children }) => <Wrapper queries={buildQueries({ onPatch })}>{children}</Wrapper>,
    });

    await screen.findByRole("dialog");
    // Wait for the saved settings to populate the form; submitting earlier
    // sends the no-data defaults (null template / default mode).
    await screen.findByDisplayValue("saved custom prompt");
    const submit = () => fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    // TanStack Form keeps its save control inert until the form is touched;
    // nudge the temperature slider first so the run mirrors real use.
    const slider = screen.getByRole("slider", { name: "assistant.settings.temperature.label" });
    fireEvent.change(slider, { target: { value: "0.7" } });
    submit();

    await waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith({
        name: "ai",
        content: {
          assistant: { temperature: 0.7, chatPromptTemplate: "saved custom prompt", chatPromptMode: "custom" },
        },
      });
    });
  });

  it("keeps the saved custom prompt after saving with Default chosen", async () => {
    const onPatch = vi.fn();
    render(<AssistantSettings isOpen={true} onOpenChange={vi.fn()} />, {
      wrapper: ({ children }) => <Wrapper queries={buildQueries({ onPatch })}>{children}</Wrapper>,
    });

    await screen.findByRole("dialog");
    await screen.findByDisplayValue("saved custom prompt");
    fireEvent.click(screen.getByRole("radio", { name: "assistant.settings.system-prompt.mode.default" }));
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith({
        name: "ai",
        content: {
          assistant: { temperature: 0.5, chatPromptTemplate: "saved custom prompt", chatPromptMode: "default" },
        },
      });
    });
  });

  it("discards unsaved edits on close and reopen", async () => {
    render(<SettingsHost onOpenChange={vi.fn()} />, {
      wrapper: ({ children }) => <Wrapper queries={buildQueries()}>{children}</Wrapper>,
    });

    await screen.findByRole("dialog");
    await screen.findByDisplayValue("saved custom prompt");
    const textbox = screen.getByRole("textbox", { name: "assistant.settings.system-prompt.label" });
    fireEvent.change(textbox, { target: { value: "unsaved edit" } });
    fireEvent.click(screen.getByRole("radio", { name: "assistant.settings.system-prompt.mode.default" }));
    fireEvent.click(document.querySelector('button[slot="close"]') as HTMLElement);

    fireEvent.click(screen.getByRole("button", { name: "open-settings" }));
    await screen.findByRole("dialog");

    expect(screen.getByRole("textbox", { name: "assistant.settings.system-prompt.label" })).toHaveProperty(
      "value",
      "saved custom prompt",
    );
    const customRadio = screen.getByRole("radio", { name: "assistant.settings.system-prompt.mode.custom" });
    expect(customRadio.getAttribute("aria-checked")).toBe("true");
  });
});
