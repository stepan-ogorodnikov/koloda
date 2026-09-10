import type { UseAutoScrollReturn } from "@koloda/ai-react";
import type * as CoreReact from "@koloda/core-react";
import { renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { currentConversationIdAtom } from "../state/conversation-store";
import { useAssistantChatHotkeys } from "./use-assistant-chat-hotkeys";

const registrations = vi.hoisted(() => ({
  newConversation: { enabled: undefined as boolean | undefined },
}));

const aiKeys = vi.hoisted(() => ({
  cancel: ["Mod+Shift+I"],
  newConversation: ["Mod+N"],
  openModelPicker: ["Mod+Shift+M"],
  previousConversation: [],
  nextConversation: [],
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
    useAppHotkey: (hotkeys: unknown, _callback: unknown, _scope: string, options?: { enabled?: boolean }) => {
      if (hotkeys === aiKeys.newConversation) {
        registrations.newConversation.enabled = options?.enabled;
      }
    },
  };
});

const scroll = {
  resetScroll: vi.fn(),
} as unknown as UseAutoScrollReturn;

function renderWithStore(store: ReturnType<typeof createStore>) {
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
  return renderHook(
    () =>
      useAssistantChatHotkeys({
        handleCancel: vi.fn(),
        handleNewConversation: vi.fn(),
        scroll,
        modelProfilePickerRef: { current: null },
      }),
    { wrapper },
  );
}

describe("useAssistantChatHotkeys", () => {
  it("enables New when a conversation id is current", () => {
    const store = createStore();
    store.set(currentConversationIdAtom, "draft");

    renderWithStore(store);

    expect(registrations.newConversation.enabled).toBe(true);
  });

  it("disables New on the param-less surface", () => {
    const store = createStore();
    store.set(currentConversationIdAtom, null);

    renderWithStore(store);

    expect(registrations.newConversation.enabled).toBe(false);
  });
});
