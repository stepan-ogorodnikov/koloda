import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiChatElapsedTimer } from "./ai-chat-elapsed-time";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    _: (message: { toString(): string }) => message.toString(),
  }),
}));

describe("AiChatElapsedTimer", () => {
  const startedAt = new Date("2026-07-01T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:30.000Z"));
  });

  it("keeps elapsed seconds from startedAt across remount", () => {
    const { unmount } = render(<AiChatElapsedTimer startedAt={startedAt} />);
    expect(screen.getByText("30")).toBeTruthy();

    unmount();
    vi.setSystemTime(new Date("2026-07-01T12:00:45.000Z"));
    render(<AiChatElapsedTimer startedAt={startedAt} />);

    expect(screen.getByText("45")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});
