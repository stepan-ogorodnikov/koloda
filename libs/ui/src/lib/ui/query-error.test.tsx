import type { ErrorCode } from "@koloda/app";
import { AppError } from "@koloda/app";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryError } from "./query-error";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

describe("QueryError", () => {
  it("falls back to unknown when the error code is missing from the catalog", () => {
    const error = new AppError("not-in-catalog" as ErrorCode);

    render(<QueryError error={error} />);

    expect(screen.getByText("unknown")).toBeTruthy();
  });

  it("shows the catalog message and keeps AppError details behind the details control", () => {
    render(<QueryError error={new AppError("db.get", "SQLITE_BUSY")} />);

    expect(screen.getByText("db.get")).toBeTruthy();
    expect(screen.queryByText("SQLITE_BUSY")).toBeNull();
    expect(screen.getByRole("button", { name: "error.details" })).toBeTruthy();
  });

  it("does not offer details when AppError has none", () => {
    render(<QueryError error={new AppError("db.get")} />);

    expect(screen.getByText("db.get")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "error.details" })).toBeNull();
  });

  it("treats a plain Error message as technical details, not the headline", () => {
    render(<QueryError error={new Error("network down")} />);

    expect(screen.getByText("query-error.message")).toBeTruthy();
    expect(screen.queryByText("network down")).toBeNull();
    expect(screen.getByRole("button", { name: "error.details" })).toBeTruthy();
  });
});
