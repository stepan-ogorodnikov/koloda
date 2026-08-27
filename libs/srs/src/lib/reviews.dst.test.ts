import { describe, expect, it } from "vitest";
import { getLearningDayRangeAt } from "./reviews";

process.env.TZ = "America/New_York";

const HOUR_MS = 60 * 60 * 1000;
const processTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe.skipIf(processTimeZone !== "America/New_York")(
  "getLearningDayRangeAt DST (requires process timezone America/New_York)",
  () => {
    it("uses a 23-hour window when before 05:00 on the spring-forward day", () => {
      const range = getLearningDayRangeAt(new Date(2024, 2, 10, 4, 30, 0, 0), "05:00");
      const from = new Date(range.from);
      const to = new Date(range.to);

      expect(range).toEqual({
        from: new Date(2024, 2, 9, 5, 0, 0, 0).toISOString(),
        to: new Date(2024, 2, 10, 5, 0, 0, 0).toISOString(),
      });
      expect(from.getHours()).toBe(5);
      expect(to.getHours()).toBe(5);
      expect(to.getTime() - from.getTime()).toBe(23 * HOUR_MS);
    });

    it("keeps 05:00 local at the spring-forward boundary", () => {
      const range = getLearningDayRangeAt(new Date(2024, 2, 10, 5, 0, 0, 0), "05:00");
      const from = new Date(range.from);
      const to = new Date(range.to);

      expect(range).toEqual({
        from: new Date(2024, 2, 10, 5, 0, 0, 0).toISOString(),
        to: new Date(2024, 2, 11, 5, 0, 0, 0).toISOString(),
      });
      expect(from.getHours()).toBe(5);
      expect(to.getHours()).toBe(5);
      expect(to.getTime() - from.getTime()).toBe(24 * HOUR_MS);
    });

    it("keeps 05:00 local after 05:00 on the spring-forward day", () => {
      const range = getLearningDayRangeAt(new Date(2024, 2, 10, 6, 30, 0, 0), "05:00");

      expect(range).toEqual({
        from: new Date(2024, 2, 10, 5, 0, 0, 0).toISOString(),
        to: new Date(2024, 2, 11, 5, 0, 0, 0).toISOString(),
      });
    });

    it("keeps 05:00 local the morning after spring-forward", () => {
      const range = getLearningDayRangeAt(new Date(2024, 2, 11, 4, 30, 0, 0), "05:00");

      expect(range).toEqual({
        from: new Date(2024, 2, 10, 5, 0, 0, 0).toISOString(),
        to: new Date(2024, 2, 11, 5, 0, 0, 0).toISOString(),
      });
    });

    it("uses a 25-hour window when before 05:00 on the fall-back day", () => {
      const range = getLearningDayRangeAt(new Date(2024, 10, 3, 4, 30, 0, 0), "05:00");
      const from = new Date(range.from);
      const to = new Date(range.to);

      expect(range).toEqual({
        from: new Date(2024, 10, 2, 5, 0, 0, 0).toISOString(),
        to: new Date(2024, 10, 3, 5, 0, 0, 0).toISOString(),
      });
      expect(from.getHours()).toBe(5);
      expect(to.getHours()).toBe(5);
      expect(to.getTime() - from.getTime()).toBe(25 * HOUR_MS);
    });

    it("keeps 05:00 local after 05:00 on the fall-back day", () => {
      const range = getLearningDayRangeAt(new Date(2024, 10, 3, 6, 30, 0, 0), "05:00");
      const from = new Date(range.from);
      const to = new Date(range.to);

      expect(range).toEqual({
        from: new Date(2024, 10, 3, 5, 0, 0, 0).toISOString(),
        to: new Date(2024, 10, 4, 5, 0, 0, 0).toISOString(),
      });
      expect(to.getTime() - from.getTime()).toBe(24 * HOUR_MS);
    });

    it("skips forward when the configured boundary is in the spring-forward gap", () => {
      const range = getLearningDayRangeAt(new Date(2024, 2, 10, 4, 0, 0, 0), "02:30");
      const from = new Date(range.from);

      expect(range).toEqual({
        from: new Date(2024, 2, 10, 2, 30, 0, 0).toISOString(),
        to: new Date(2024, 2, 11, 3, 30, 0, 0).toISOString(),
      });
      expect(from.getHours()).toBe(3);
      expect(from.getMinutes()).toBe(30);
    });

    it("skips the next-day boundary forward when setDate lands in the spring-forward gap", () => {
      const range = getLearningDayRangeAt(new Date(2024, 2, 9, 4, 0, 0, 0), "02:30");
      const to = new Date(range.to);

      expect(range).toEqual({
        from: new Date(2024, 2, 9, 2, 30, 0, 0).toISOString(),
        to: new Date(2024, 2, 10, 2, 30, 0, 0).toISOString(),
      });
      expect(to.getHours()).toBe(3);
      expect(to.getMinutes()).toBe(30);
    });

    it("picks the earlier occurrence when the configured boundary is in the repeated hour", () => {
      const range = getLearningDayRangeAt(new Date(2024, 10, 3, 3, 0, 0, 0), "01:30");
      const from = new Date(range.from);

      expect(range).toEqual({
        from: new Date(2024, 10, 3, 1, 30, 0, 0).toISOString(),
        to: new Date(2024, 10, 4, 1, 30, 0, 0).toISOString(),
      });
      expect(from.getTime()).toBe(Date.UTC(2024, 10, 3, 5, 30, 0, 0));
    });

    it("uses the same 25-hour window when now is in the repeated hour", () => {
      const earlier = new Date(2024, 10, 3, 1, 30, 0, 0);
      const later = new Date("2024-11-03T06:30:00.000Z");
      const expected = {
        from: new Date(2024, 10, 2, 5, 0, 0, 0).toISOString(),
        to: new Date(2024, 10, 3, 5, 0, 0, 0).toISOString(),
      };

      expect(getLearningDayRangeAt(earlier, "05:00")).toEqual(expected);
      expect(getLearningDayRangeAt(later, "05:00")).toEqual(expected);
      expect(new Date(expected.to).getTime() - new Date(expected.from).getTime()).toBe(25 * HOUR_MS);
    });
  },
);
