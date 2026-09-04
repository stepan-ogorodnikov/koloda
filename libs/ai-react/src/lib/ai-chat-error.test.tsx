import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AIChatError } from "./ai-chat-error";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@koloda/core-react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAppHotkey: () => {},
    useHotkeysSettings: () => ({ ui: { close: ["Escape"] } }),
  };
});

describe("AIChatError", () => {
  it("shows the catalog message and keeps details behind the details control", async () => {
    render(<AIChatError message="ai.http.401" details="Unauthorized" onDismiss={() => {}} />);

    expect(screen.getByText("ai.http.401")).toBeTruthy();
    expect(screen.queryByText("Unauthorized")).toBeNull();
    expect(screen.getByRole("button", { name: "ai.chat.error.close" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "error.details" }));

    expect(await screen.findByText("Unauthorized")).toBeTruthy();
  });

  it("offers retry when onRetry is provided", () => {
    const onRetry = vi.fn();
    render(<AIChatError message="db.update" details="SQLITE_BUSY" onRetry={onRetry} onDismiss={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "ai.chat.error.retry-save" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
