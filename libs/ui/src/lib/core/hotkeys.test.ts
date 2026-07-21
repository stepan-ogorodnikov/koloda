import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { describe, expect, it, vi } from "vitest";
import { dispatchKey, isComposingEvent, isPrintableKey, matchesAnyHotkey } from "./hotkeys";

function createReactKeyEvent(
  partial: Partial<ReactKeyboardEvent<HTMLElement>> & { key: string },
): ReactKeyboardEvent<HTMLElement> {
  return {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    nativeEvent: { isComposing: false },
    ...partial,
  } as ReactKeyboardEvent<HTMLElement>;
}

describe("isPrintableKey", () => {
  it("returns true for a single character without modifiers", () => {
    expect(isPrintableKey(createReactKeyEvent({ key: "a" }))).toBe(true);
  });

  it("returns false for modifier combinations and non-character keys", () => {
    expect(isPrintableKey(createReactKeyEvent({ key: "a", ctrlKey: true }))).toBe(false);
    expect(isPrintableKey(createReactKeyEvent({ key: "Enter" }))).toBe(false);
  });
});

describe("matchesAnyHotkey", () => {
  it("matches when any registered hotkey matches the event", () => {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });

    expect(matchesAnyHotkey(event, ["Escape", "Enter"])).toBe(true);
    expect(matchesAnyHotkey(event, ["Enter"])).toBe(false);
  });

  it("matches modifier hotkeys", () => {
    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true });

    expect(matchesAnyHotkey(event, ["Mod+S"])).toBe(true);
    expect(matchesAnyHotkey(event, ["Mod+K"])).toBe(false);
  });

  it("returns false for an empty hotkey list", () => {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });

    expect(matchesAnyHotkey(event, [])).toBe(false);
  });
});

describe("dispatchKey", () => {
  it("dispatches a keydown event on the ref target", () => {
    const target = document.createElement("div");
    const listener = vi.fn();
    target.addEventListener("keydown", listener);

    const ref: RefObject<HTMLElement | null> = { current: target };
    dispatchKey(ref, "ArrowDown");

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]![0]).toMatchObject({ key: "ArrowDown" });
  });

  it("no-ops when the ref has no current element", () => {
    expect(() => dispatchKey({ current: null }, "Escape")).not.toThrow();
  });
});

describe("isComposingEvent", () => {
  it("detects composing IME events", () => {
    expect(isComposingEvent(createReactKeyEvent({ key: "a", nativeEvent: { isComposing: true } }))).toBe(true);
    expect(isComposingEvent(createReactKeyEvent({ key: "a" }))).toBe(false);
  });
});
