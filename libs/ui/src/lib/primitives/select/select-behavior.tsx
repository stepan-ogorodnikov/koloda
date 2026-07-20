import { useAppHotkey, useHotkeysSettings, useHotkeysStatus } from "@koloda/core-react";
import { dispatchKey, matchesAnyHotkey } from "@koloda/ui";
import type { Key, KeyboardDelegate } from "@react-types/shared";
import type { HotkeyOptions } from "@tanstack/react-hotkeys";
import type { RefObject } from "react";
import { useContext, useEffect } from "react";
import { SelectStateContext } from "react-aria-components";
import type { SelectState as ReactAriaSelectState } from "react-stately";

export type SelectState = ReactAriaSelectState<unknown, "single" | "multiple"> | null;

// Delegate for Select that preserves arrow navigation
export function createSelectKeyboardDelegate(stateRef: RefObject<SelectState>): KeyboardDelegate {
  const getState = () => stateRef.current;

  return {
    getKeyAbove(key: Key) {
      const state = getState();
      return state?.collection.getKeyBefore(key) ?? null;
    },
    getKeyBelow(key: Key) {
      const state = getState();
      return state?.collection.getKeyAfter(key) ?? null;
    },
    getFirstKey() {
      const state = getState();
      return state?.collection.getFirstKey() ?? null;
    },
    getLastKey() {
      const state = getState();
      return state?.collection.getLastKey() ?? null;
    },
  };
}

// Store Select state from context to build a keyboard delegate
export function SelectStateBridge({ stateRef }: { stateRef: RefObject<SelectState> }) {
  const state = useContext(SelectStateContext);

  useEffect(() => {
    stateRef.current = state;
  }, [state, stateRef]);

  return null;
}

export function useSelectHotkeys(ref: RefObject<HTMLDivElement | null>) {
  const { ui } = useHotkeysSettings();
  const { disableScope, enableScope } = useHotkeysStatus();
  const state = useContext(SelectStateContext);
  const isOpen = state?.isOpen ?? false;
  const options: HotkeyOptions = { target: ref.current ?? document, ignoreInputs: false, conflictBehavior: "allow" };

  useAppHotkey(ui.focusNext, () => dispatchSelectNavigationKey(ref, state, "ArrowDown"), "", options);
  useAppHotkey(ui.focusPrev, () => dispatchSelectNavigationKey(ref, state, "ArrowUp"), "", options);

  useEffect(() => {
    (isOpen ? disableScope : enableScope)("nav");
  }, [isOpen, disableScope, enableScope]);

  // Capture-phase listener for the close hotkey. This fires before the Autocomplete's
  // onKeyDown can call stopPropagation (which in React 19 also stops the native event),
  // so the hotkey works even when focus is on the search input.
  useEffect(() => {
    if (!state?.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesAnyHotkey(e, ui.close)) {
        e.preventDefault();
        e.stopPropagation();
        state.close();
      } else if ((e.target as HTMLElement).tagName !== "INPUT") {
        // Fix for hotkeys with 'Alt' modifier breaking selecting with 'Space'
        if (e.key === " " || e.key === "Space") {
          const focusedKey = state.selectionManager.focusedKey;
          if (focusedKey) {
            e.preventDefault();
            e.stopPropagation();
            state.selectionManager.select(focusedKey);
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [state, ui.close]);

  return null;
}

function dispatchSelectNavigationKey(
  ref: RefObject<HTMLElement | null>,
  state: SelectState,
  key: "ArrowDown" | "ArrowUp",
) {
  if (!state?.isOpen) return;
  state.selectionManager.setFocused(true);
  dispatchKey(ref, key);
}

export function isIterableEmpty(items?: Iterable<unknown>) {
  if (items == null) return true;
  for (const _ of items) return false;
  return true;
}
