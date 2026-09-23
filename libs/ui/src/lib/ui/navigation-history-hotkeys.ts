import { getAppPlatform } from "@koloda/app";
import { useEffect } from "react";
import type { RouterHistoryNavigation } from "./use-router-history-navigation";

function isElectronHost() {
  return "electronAPI" in window;
}

function isTextEntryTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function isPlainMod(event: KeyboardEvent) {
  if (event.altKey || event.shiftKey) return false;
  if (getAppPlatform() === "macos") return event.metaKey && !event.ctrlKey;
  return event.ctrlKey && !event.metaKey;
}

function isPlainAlt(event: KeyboardEvent) {
  return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

function navigationDirection(event: KeyboardEvent) {
  if (isTextEntryTarget(event.target)) return null;
  if (isPlainAlt(event)) {
    if (event.key === "ArrowLeft") return "back";
    if (event.key === "ArrowRight") return "forward";
    return null;
  }
  if (!isPlainMod(event)) return null;
  if (event.key === "[") return "back";
  if (event.key === "]") return "forward";
  return null;
}

export function useNavigationHistoryHotkeys({ canGoBack, canGoForward, goBack, goForward }: RouterHistoryNavigation) {
  useEffect(() => {
    // WHY: These chords are fixed desktop shortcuts, outside Settings → Hotkeys.
    // Web must keep the browser's history keys, so the listener never attaches there.
    if (!isElectronHost()) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const direction = navigationDirection(event);
      if (!direction) return;
      // WHY: Swallow the key so the desktop window does not also walk its own web history.
      event.preventDefault();
      if (direction === "back") {
        if (!canGoBack) return;
        goBack();
        return;
      }
      if (!canGoForward) return;
      goForward();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canGoBack, canGoForward, goBack, goForward]);
}
