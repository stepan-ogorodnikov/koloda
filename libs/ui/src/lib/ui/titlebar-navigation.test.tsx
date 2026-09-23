import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TitlebarNavigation } from "./titlebar-navigation";

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

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: string) => message,
  }),
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

describe("TitlebarNavigation", () => {
  beforeEach(() => {
    history.back.mockClear();
    history.forward.mockClear();
    router.href = "/decks";
    router.canGoBack = true;
    Reflect.deleteProperty(window, "electronAPI");
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (X11; Linux x86_64)",
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "electronAPI");
  });

  it("goes back and forward through the shared history helper", () => {
    render(<TitlebarNavigation />);

    const back = screen.getByRole("button", { name: "titlebar.navigation.back" });
    const forward = screen.getByRole("button", { name: "titlebar.navigation.forward" });

    expect(back.hasAttribute("disabled")).toBe(false);
    expect(forward.hasAttribute("disabled")).toBe(true);

    fireEvent.click(back);

    expect(history.back).toHaveBeenCalledOnce();
    expect(forward.hasAttribute("disabled")).toBe(false);

    fireEvent.click(forward);

    expect(history.forward).toHaveBeenCalledOnce();
    expect(forward.hasAttribute("disabled")).toBe(true);
  });

  it("does not offer back when the router cannot go back", () => {
    router.canGoBack = false;
    render(<TitlebarNavigation />);

    expect(screen.getByRole("button", { name: "titlebar.navigation.back" }).hasAttribute("disabled")).toBe(true);
  });

  it("uses the same history as the Electron back and forward hotkeys", () => {
    Object.defineProperty(window, "electronAPI", { configurable: true, value: {} });
    render(<TitlebarNavigation />);

    fireEvent.click(screen.getByRole("button", { name: "titlebar.navigation.back" }));
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true, cancelable: true }),
      );
    });

    expect(history.forward).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "titlebar.navigation.forward" }).hasAttribute("disabled")).toBe(true);
  });
});