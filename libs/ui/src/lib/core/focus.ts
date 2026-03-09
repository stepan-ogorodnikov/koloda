import { setInteractionModality } from "@react-aria/interactions";

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[tabindex]",
  "[contenteditable=\"true\"]",
].join(", ");

function getTabbableElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
    .filter((element) => {
      if (element.tabIndex < 0) return false;
      if (element.hasAttribute("disabled")) return false;
      if (element.getAttribute("aria-hidden") === "true") return false;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      return element.getClientRects().length > 0;
    });
}

function getFocusScope(): HTMLElement | null {
  const activeElement = document.activeElement as HTMLElement | null;
  if (!activeElement) return null;

  let element: HTMLElement | null = activeElement;
  while (element && element !== document.body) {
    const role = element.getAttribute("role");
    if (role === "dialog" || role === "menu" || role === "listbox" || role === "combobox" || role === "tooltip") {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

function getTabbableInScope(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
    .filter((element) => {
      if (element.tabIndex < 0) return false;
      if (element.hasAttribute("disabled")) return false;
      if (element.getAttribute("aria-hidden") === "true") return false;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      return element.getClientRects().length > 0;
    });
}

function focusByOffset(offset: 1 | -1) {
  setInteractionModality("keyboard");

  const focusScope = getFocusScope();
  const elements = focusScope ? getTabbableInScope(focusScope) : getTabbableElements();
  if (!elements.length) return;

  const activeElement = document.activeElement as HTMLElement | null;
  let activeIndex = -1;
  let startedInsideContainer = false;

  if (activeElement) {
    activeIndex = elements.findIndex((element) => element === activeElement || element.contains(activeElement));
    if (activeIndex === -1) {
      const insideIndex = elements.findIndex((el) => activeElement.contains(el));
      if (insideIndex !== -1) {
        activeIndex = insideIndex;
        startedInsideContainer = true;
      }
    }
  }

  const nextIndex = activeIndex === -1
    ? (offset > 0 ? 0 : elements.length - 1)
    : startedInsideContainer
    ? activeIndex
    : (activeIndex + offset + elements.length) % elements.length;

  elements[nextIndex]?.focus();
}

export function focusNext(e: KeyboardEvent) {
  e.preventDefault();
  focusByOffset(1);
}

export function focusPrev(e: KeyboardEvent) {
  e.preventDefault();
  focusByOffset(-1);
}
