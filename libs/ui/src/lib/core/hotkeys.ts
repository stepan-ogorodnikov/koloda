import { matchesKeyboardEvent, rawHotkeyToParsedHotkey } from "@tanstack/hotkeys";
import type { Hotkey, ParsedHotkey, RawHotkey, RegisterableHotkey } from "@tanstack/hotkeys";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";

export function isPrintableKey(e: ReactKeyboardEvent<HTMLElement>) {
  return (e.altKey || e.ctrlKey || e.metaKey) ? false : e.key.length === 1;
}

export function matchesAnyHotkey(event: KeyboardEvent, hotkeys: RegisterableHotkey[]) {
  return hotkeys.some((hotkey) => matchesKeyboardEvent(event, toMatchableHotkey(hotkey)));
}

export function dispatchArrowKey(ref: RefObject<HTMLDivElement | null>, key: "ArrowDown" | "ArrowUp") {
  const target = ref.current;
  if (!target) return;
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
}

function toMatchableHotkey(hotkey: RegisterableHotkey): Hotkey | ParsedHotkey {
  return isRawHotkey(hotkey) ? rawHotkeyToParsedHotkey(hotkey) : hotkey;
}

function isRawHotkey(hotkey: RegisterableHotkey): hotkey is RawHotkey {
  return typeof hotkey !== "string";
}

export function isComposingEvent(event: ReactKeyboardEvent<HTMLElement>) {
  const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean };
  return !!nativeEvent.isComposing;
}
