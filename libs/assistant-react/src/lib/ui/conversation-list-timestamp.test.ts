import { describe, expect, it } from "vitest";
import { formatConversationListRelativeTime } from "./conversation-list-timestamp";

const DAY_MS = 86_400_000;

const formatters = {
  minutes: (count: number) => `${count}m`,
  hours: (count: number) => `${count}h`,
  days: (count: number) => `${count}d`,
  months: (count: number) => `${count}mo`,
  years: (count: number) => `${count}y`,
};

describe("formatConversationListRelativeTime", () => {
  const now = new Date("2026-07-01T12:00:00.000Z");

  it.each([
    { offsetMs: 0, expected: "1m" },
    { offsetMs: 30_000, expected: "1m" },
    { offsetMs: 59_999, expected: "1m" },
    { offsetMs: 60_000, expected: "1m" },
    { offsetMs: 3_600_000, expected: "1h" },
    { offsetMs: DAY_MS, expected: "1d" },
    { offsetMs: 6 * DAY_MS, expected: "6d" },
    { offsetMs: 29 * DAY_MS, expected: "29d" },
    { offsetMs: 30 * DAY_MS, expected: "1mo" },
    { offsetMs: 60 * DAY_MS, expected: "2mo" },
    { offsetMs: 330 * DAY_MS, expected: "11mo" },
    { offsetMs: 365 * DAY_MS, expected: "1y" },
    { offsetMs: 800 * DAY_MS, expected: "2y" },
  ])("formats $offsetMs ms ago as $expected", ({ offsetMs, expected }) => {
    const timestamp = new Date(now.getTime() - offsetMs);
    expect(formatConversationListRelativeTime(timestamp, now, formatters)).toBe(expected);
  });
});
