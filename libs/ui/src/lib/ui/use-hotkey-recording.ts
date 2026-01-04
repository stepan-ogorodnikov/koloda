import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDisplay, isAllowedMainKey, isModifier } from "./hotkey-utility";

const MAX_NUMBER_OF_MODIFIERS = 2;

export function useHotkeyRecording(isOpen: boolean, isDisabled?: boolean) {
  const [modKeys, setModKeys] = useState<Set<string>>(new Set());
  const [mainKey, setMainKey] = useState<string | null>(null);
  const modKeysRef = useRef<Set<string>>(new Set());
  const mainKeyRef = useRef<string | null>(null);
  const platform: "mac" | "other" = /mac/i.test(navigator.userAgent) ? "mac" : "other";

  const reset = useCallback(() => {
    modKeysRef.current = new Set();
    mainKeyRef.current = null;
    setModKeys(new Set());
    setMainKey(null);
  }, []);

  const resetOnOpen = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    if (!isOpen || isDisabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const k = e.key;
      const code = e.code;

      if (isModifier(k)) {
        // if main key is already set, reset the whole combination
        if (mainKeyRef.current) {
          reset();
          return;
        }
        const lower = k.toLowerCase();
        // add modifier if not already pressed and there is room for another modifier
        if (modKeysRef.current.has(lower) || modKeysRef.current.size < MAX_NUMBER_OF_MODIFIERS) {
          modKeysRef.current.add(lower);
          setModKeys(new Set(modKeysRef.current));
        }
      } else if (isAllowedMainKey(k, code)) {
        // set main key, reset if already set to allow replacement
        if (mainKeyRef.current) reset();
        mainKeyRef.current = code;
        setMainKey(code);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // don't clear modifiers if main key is already set
      if (mainKeyRef.current) return;

      const k = e.key;

      if (isModifier(k)) {
        const lower = k.toLowerCase();
        if (modKeysRef.current.has(lower)) {
          modKeysRef.current.delete(lower);
          setModKeys(new Set(modKeysRef.current));
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown as unknown as EventListener);
    window.addEventListener("keyup", handleKeyUp as unknown as EventListener);
    return () => {
      window.removeEventListener("keydown", handleKeyDown as unknown as EventListener);
      window.removeEventListener("keyup", handleKeyUp as unknown as EventListener);
    };
  }, [isOpen, isDisabled, reset]);

  const partialDisplay = formatDisplay(Array.from(modKeys), mainKey, platform);

  return {
    modKeys,
    mainKey,
    partialDisplay,
    platform,
    reset,
    resetOnOpen,
  };
}
