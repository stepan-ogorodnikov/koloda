import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNavigationHistoryHotkeys } from "./navigation-history-hotkeys";
import { useRouterHistoryNavigation } from "./use-router-history-navigation";

const { history, router } = vi.hoisted(() => ({
  history: {
    back: vi.fn(),
    forward: vi.fn(),
  },
  router: {
    href: "/decks",
    canGoBack: true,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useCanGoBack: () => router.canGoBack,
  useRouter: () => ({
    get state() {
      return { location: { href: router.href } };
    },
    history,
  }),
}));

function Harness() {
  const navigation = useRouterHistoryNavigation();
  useNavigationHistoryHotkeys(navigation);
  return (
    <>
      <button type="button" disabled={!navigation.canGoBack} onClick={navigation.goBack}>
        back
      </button>
      <button type="button" disabled={!navigation.canGoForward} onClick={navigation.goForward}>
        forward
      </button>
      <input aria-label="name" />
      <textarea aria-label="notes" />
    </>
  );
}

function setElectronHost(isElectron: boolean) {
  if (isElectron) {
    Object.defineProperty(window, "electronAPI", { configurable: true, value: {} });
    return;
  }
  Reflect.deleteProperty(window, "electronAPI");
}

function setPlatform(platform: "linux" | "macos") {
  const userAgent =
    platform === "macos" ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" : "Mozilla/5.0 (X11; Linux x86_64)";
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: userAgent });
  Object.defineProperty(navigator, "userAgentData", { configurable: true, value: undefined });
}

function press(init: KeyboardEventInit, target: EventTarget = window) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("useNavigationHistoryHotkeys", () => {
  beforeEach(() => {
    history.back.mockClear();
    history.forward.mockClear();
    router.href = "/decks";
    router.canGoBack = true;
    setPlatform("linux");
    setElectronHost(false);
  });

  afterEach(() => {
    setElectronHost(false);
  });

  it("does not register history chords when the host is not Electron", () => {
    render(<Harness />);

    const back = press({ key: "[", ctrlKey: true });
    const forward = press({ key: "ArrowRight", altKey: true });

    expect(back.defaultPrevented).toBe(false);
    expect(forward.defaultPrevented).toBe(false);
    expect(history.back).not.toHaveBeenCalled();
    expect(history.forward).not.toHaveBeenCalled();
  });

  it("navigates back and forward on the Linux/Windows chords", () => {
    setElectronHost(true);
    render(<Harness />);

    press({ key: "[", ctrlKey: true });
    expect(history.back).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "forward" }).hasAttribute("disabled")).toBe(false);

    press({ key: "]", ctrlKey: true });
    expect(history.forward).toHaveBeenCalledOnce();

    press({ key: "ArrowLeft", altKey: true });
    expect(history.back).toHaveBeenCalledTimes(2);

    press({ key: "ArrowRight", altKey: true });
    expect(history.forward).toHaveBeenCalledTimes(2);
  });

  it("uses Cmd as Mod on macOS and ignores Ctrl there", () => {
    setPlatform("macos");
    setElectronHost(true);
    render(<Harness />);

    const ctrl = press({ key: "[", ctrlKey: true });
    expect(ctrl.defaultPrevented).toBe(false);
    expect(history.back).not.toHaveBeenCalled();

    press({ key: "[", metaKey: true });
    press({ key: "]", metaKey: true });

    expect(history.back).toHaveBeenCalledOnce();
    expect(history.forward).toHaveBeenCalledOnce();
  });

  it("ignores chords with extra modifiers", () => {
    setElectronHost(true);
    render(<Harness />);

    const shifted = press({ key: "[", ctrlKey: true, shiftKey: true });
    const altCtrl = press({ key: "ArrowLeft", altKey: true, ctrlKey: true });

    expect(shifted.defaultPrevented).toBe(false);
    expect(altCtrl.defaultPrevented).toBe(false);
    expect(history.back).not.toHaveBeenCalled();
  });

  it("leaves text entry alone", () => {
    setElectronHost(true);
    render(<Harness />);

    const input = screen.getByRole("textbox", { name: "name" });
    const notes = screen.getByRole("textbox", { name: "notes" });
    const inInput = press({ key: "[", ctrlKey: true }, input);
    const inNotes = press({ key: "ArrowLeft", altKey: true }, notes);

    expect(inInput.defaultPrevented).toBe(false);
    expect(inNotes.defaultPrevented).toBe(false);
    expect(history.back).not.toHaveBeenCalled();
  });

  it("does not move history when that direction is unavailable", () => {
    router.canGoBack = false;
    setElectronHost(true);
    render(<Harness />);

    const back = press({ key: "[", ctrlKey: true });
    const forward = press({ key: "ArrowRight", altKey: true });

    expect(back.defaultPrevented).toBe(true);
    expect(forward.defaultPrevented).toBe(true);
    expect(history.back).not.toHaveBeenCalled();
    expect(history.forward).not.toHaveBeenCalled();
  });

  it("shares the forward stack with the titlebar actions", () => {
    setElectronHost(true);
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "back" }));
    window.dispatchEvent(new PopStateEvent("popstate"));

    press({ key: "ArrowRight", altKey: true });

    expect(history.forward).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "forward" }).hasAttribute("disabled")).toBe(true);
  });
});
