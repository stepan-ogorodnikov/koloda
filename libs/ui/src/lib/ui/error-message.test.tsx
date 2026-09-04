import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorMessage } from "./error-message";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

describe("ErrorMessage", () => {
  it("does not offer a details control when details are missing or blank", () => {
    const { rerender } = render(<ErrorMessage message="Failed to load data" />);

    expect(screen.queryByRole("button", { name: "error.details" })).toBeNull();

    rerender(<ErrorMessage message="Failed to load data" details="   " />);

    expect(screen.queryByRole("button", { name: "error.details" })).toBeNull();
  });

  it("keeps the message and details control on one row when layout is inline", () => {
    const { container } = render(
      <ErrorMessage layout="inline" message="Failed to delete data" details="SQLITE_BUSY" />,
    );

    expect(container.firstElementChild?.className).toContain("flex-row");
    expect(screen.getByText("Failed to delete data")).toBeTruthy();
    expect(screen.getByRole("button", { name: "error.details" })).toBeTruthy();
  });

  it("reveals technical details in a popover after the details control is pressed", async () => {
    render(<ErrorMessage message="Failed to load data" details="SQLITE_BUSY" />);

    expect(screen.getByText("Failed to load data")).toBeTruthy();
    expect(screen.queryByText("SQLITE_BUSY")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    const trigger = screen.getByRole("button", { name: "error.details" });
    fireEvent.click(trigger);

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("SQLITE_BUSY")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("SQLITE_BUSY")).toBeNull();
  });
});
