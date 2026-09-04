import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Errors } from "./form";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

describe("Errors", () => {
  it("falls back to unknown when the error code is missing from the catalog", () => {
    render(<Errors errors={[{ message: "not-in-catalog", path: ["title"] }]} />);

    expect(screen.getByRole("alert").textContent).toBe("unknown");
  });

  it("renders catalog messages for known error codes", () => {
    render(<Errors errors={[{ message: "db.get", path: ["title"] }]} />);

    expect(screen.getByRole("alert").textContent).toBe("db.get");
  });

  it("keeps AppError details behind the details control", async () => {
    render(<Errors errors={[{ message: "db.add", path: ["0"], details: "SQLITE_BUSY" }]} />);

    const message = screen.getByText("db.add");
    expect(message.closest("div")?.className).toContain("flex-row");
    expect(screen.queryByText("SQLITE_BUSY")).toBeNull();

    const trigger = screen.getByRole("button", { name: "error.details" });
    fireEvent.click(trigger);

    expect(await screen.findByText("SQLITE_BUSY")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
