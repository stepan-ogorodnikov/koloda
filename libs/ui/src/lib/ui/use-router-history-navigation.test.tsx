import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  const { canGoBack, canGoForward, goBack, goForward } = useRouterHistoryNavigation();
  return (
    <>
      <button type="button" disabled={!canGoBack} onClick={goBack}>
        back
      </button>
      <button type="button" disabled={!canGoForward} onClick={goForward}>
        forward
      </button>
    </>
  );
}

function popstate() {
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

describe("useRouterHistoryNavigation", () => {
  beforeEach(() => {
    history.back.mockClear();
    history.forward.mockClear();
    router.href = "/decks";
    router.canGoBack = true;
  });

  it("starts without a forward step and records one when going back", () => {
    render(<Harness />);

    expect(screen.getByRole("button", { name: "back" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "forward" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "back" }));

    expect(history.back).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "forward" }).hasAttribute("disabled")).toBe(false);
  });

  it("keeps the forward stack across the popstate from its own back and forward", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "back" }));
    popstate();

    expect(screen.getByRole("button", { name: "forward" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "forward" }));
    popstate();

    expect(history.forward).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "forward" }).hasAttribute("disabled")).toBe(true);
  });

  it("pops one forward entry at a time and leaves the rest available", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "back" }));
    router.href = "/cards";
    fireEvent.click(screen.getByRole("button", { name: "back" }));

    fireEvent.click(screen.getByRole("button", { name: "forward" }));

    expect(history.forward).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "forward" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "forward" }));

    expect(history.forward).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "forward" }).hasAttribute("disabled")).toBe(true);
  });

  it("clears the forward stack when the user navigates outside these controls", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "back" }));
    popstate();
    popstate();

    expect(screen.getByRole("button", { name: "forward" }).hasAttribute("disabled")).toBe(true);
  });
});
