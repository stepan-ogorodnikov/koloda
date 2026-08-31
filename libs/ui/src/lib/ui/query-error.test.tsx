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

  it("renders the generic query error message for non-AppError failures", () => {
    render(<QueryError error={new Error("network down")} />);

    expect(screen.getByText("query-error.message")).toBeTruthy();
  });
});
