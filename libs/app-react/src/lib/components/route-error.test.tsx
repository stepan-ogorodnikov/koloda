import { AppError } from "@koloda/app";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RouteError } from "./route-error";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

vi.mock("@koloda/core-react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAppHotkey: () => {},
    useHotkeysSettings: () => ({
      ui: { close: ["Escape"] },
      form: { submit: ["Control+Enter"], reset: ["Escape"] },
    }),
  };
});

function renderRouteError(error: Error, reset: () => void = () => {}) {
  return render(<RouteError error={error} reset={reset} />);
}

describe("RouteError", () => {
  it("shows a generic message and the raw error as details for plain errors", async () => {
    renderRouteError(new Error("boom"));

    expect(screen.getByText("route-error.message")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "error.details" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("translates known app error codes instead of the crash text", () => {
    renderRouteError(new AppError("db.get"));

    expect(screen.getByText("db.get")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "error.details" })).toBeNull();
  });

  it("retries rendering through the router reset next to a full reload button", () => {
    const reset = vi.fn();
    renderRouteError(new Error("boom"), reset);

    fireEvent.click(screen.getByRole("button", { name: "route-error.retry" }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "route-error.reload" })).toBeTruthy();
  });
});
