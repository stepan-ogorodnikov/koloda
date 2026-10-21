import type { UseAutoScrollReturn } from "@koloda/ai-react";
import type * as CoreReact from "@koloda/core-react";
import { renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { useAssistantChatHotkeys } from "./use-assistant-chat-hotkeys";

const registrations = vi.hoisted(() => ({
  newConversation: { enabled: undefined as boolean | undefined },
  toggleSettings: { callback: undefined as (() => void) | undefined },
}));

const aiKeys = vi.hoisted(() => ({
  cancel: ["Mod+Shift+I"],
  newConversation: ["Mod+N"],
  openModelPicker: ["Mod+Shift+M"],
  previousConversation: [],
  nextConversation: [],
  toggleSettings: ["Mod+Shift+S"],
  scrollUp: [],
  scrollDown: [],
  scrollToTop: [],
  scrollToBottom: [],
}));

vi.mock("@koloda/core-react", async (importOriginal) => {
  const actual = await importOriginal<typeof CoreReact>();
  return {
    ...actual,
    useHotkeysSettings: () => ({ ai: aiKeys }),
    useAppHotkey: (hotkeys: unknown, callback: () => void, _scope: string, options?: { enabled?: boolean }) => {
      if (hotkeys === aiKeys.newConversation) {
        registrations.newConversation.enabled = options?.enabled;
      }
      if (hotkeys === aiKeys.toggleSettings) {
        registrations.toggleSettings.callback = callback;
      }
    },
  };
});

const scroll = {
  resetScroll: vi.fn(),
} as unknown as UseAutoScrollReturn;

function renderWithStore(
  store: ReturnType<typeof createStore>,
  conversationId: string | undefined,
  onToggleSettings = vi.fn(),
) {
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
  return renderHook(
    () =>
      useAssistantChatHotkeys({
        conversationId,
        handleCancel: vi.fn(),
        handleNewConversation: vi.fn(),
        scroll,
        modelProfilePickerRef: { current: null },
        onToggleSettings,
      }),
    { wrapper },
  );
}

describe("useAssistantChatHotkeys", () => {
  it("enables New when the route names a conversation, even before one is current in the store", () => {
    // WHY: A conversation that fails to load on a cold start never becomes current.
    renderWithStore(createStore(), "draft");

    expect(registrations.newConversation.enabled).toBe(true);
  });

  it("disables New on the param-less surface", () => {
    renderWithStore(createStore(), undefined);

    expect(registrations.newConversation.enabled).toBe(false);
  });

  it("routes the toggle-settings hotkey to onToggleSettings", () => {
    const store = createStore();
    const onToggleSettings = vi.fn();

    renderWithStore(store, "draft", onToggleSettings);
    registrations.toggleSettings.callback?.();

    expect(onToggleSettings).toHaveBeenCalledTimes(1);
  });
});
