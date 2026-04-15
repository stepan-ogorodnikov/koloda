import { createFocusManager } from "@react-aria/focus";
import { setInteractionModality } from "@react-aria/interactions";

function dispatchTabNavigation(offset: 1 | -1) {
  const activeElement = document.activeElement as HTMLElement | null;
  if (!activeElement) return false;

  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "Tab",
    shiftKey: offset < 0,
  });

  activeElement.dispatchEvent(event);
  return event.defaultPrevented;
}

function focusByOffset(offset: 1 | -1) {
  setInteractionModality("keyboard");

  // Let composite widgets apply their own Tab behavior first (e.g. toolbars).
  if (dispatchTabNavigation(offset)) return;

  const root = document.body;
  if (!root) return;

  const focusManager = createFocusManager({ current: root }, { tabbable: true, wrap: true });
  const activeElement = document.activeElement;

  if (!activeElement || !root.contains(activeElement)) {
    if (offset > 0) {
      focusManager.focusFirst();
    } else {
      focusManager.focusLast();
    }
    return;
  }

  if (offset > 0) {
    focusManager.focusNext({ from: activeElement, wrap: true });
  } else {
    focusManager.focusPrevious({ from: activeElement, wrap: true });
  }
}

export function focusNext(e: KeyboardEvent) {
  e.preventDefault();
  focusByOffset(1);
}

export function focusPrev(e: KeyboardEvent) {
  e.preventDefault();
  focusByOffset(-1);
}

function moveFocusedTab(offset: 1 | -1) {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;

  const tab = active.closest<HTMLElement>("[role=\"tab\"]");
  if (!tab) return false;

  const tabList = tab.closest<HTMLElement>("[role=\"tablist\"]");
  if (!tabList) return false;

  const orientation = tabList.getAttribute("aria-orientation") || tabList.getAttribute("data-orientation");
  const isVertical = orientation === "vertical";
  const key = offset > 0
    ? (isVertical ? "ArrowDown" : "ArrowRight")
    : (isVertical ? "ArrowUp" : "ArrowLeft");

  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  tab.dispatchEvent(event);
  return true;
}

export function goToNextTab(e: KeyboardEvent) {
  if (moveFocusedTab(1)) e.preventDefault();
}

export function goToPrevTab(e: KeyboardEvent) {
  if (moveFocusedTab(-1)) e.preventDefault();
}
