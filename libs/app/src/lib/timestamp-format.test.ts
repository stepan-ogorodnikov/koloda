import { describe, expect, it } from "vitest";
import { formatTimestamp, timeFieldFormatOptions } from "./timestamp-format";

const SAMPLE = new Date(2026, 8, 23, 14, 5, 45);
const LOCALE_FORMATS = { dateFormat: "locale", timeFormat: "locale" };
const EN = "en";
const RU = "ru";

// Each sentinel case pins formatTimestamp against the exact Intl construction the
// pre-settings call sites used: "date" — cards-table-cell TIMESTAMP_OPTIONS (and the
// bare i18n.date of form.tsx, identical for en/ru), "time" — message-timestamp
// TIME_OPTIONS, "datetime" — card-details/card-reviews TIMESTAMP_OPTIONS.
describe("formatTimestamp sentinels", () => {
  it("renders the date sentinel as today's table and form dates", () => {
    for (const locale of [EN, RU]) {
      const explicit = new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      }).format(SAMPLE);
      const bare = new Intl.DateTimeFormat(locale).format(SAMPLE);

      expect(formatTimestamp(SAMPLE, "date", LOCALE_FORMATS, locale)).toBe(explicit);
      expect(formatTimestamp(SAMPLE, "date", LOCALE_FORMATS, locale)).toBe(bare);
    }
  });

  it("renders the time sentinel as today's chat clock times", () => {
    for (const locale of [EN, RU]) {
      const expected = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(SAMPLE);

      expect(formatTimestamp(SAMPLE, "time", LOCALE_FORMATS, locale)).toBe(expected);
    }
  });

  it("renders the datetime sentinel as today's card details timestamps", () => {
    for (const locale of [EN, RU]) {
      const expected = new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(SAMPLE);

      expect(formatTimestamp(SAMPLE, "datetime", LOCALE_FORMATS, locale)).toBe(expected);
    }
  });
});

describe("formatTimestamp presets and custom patterns", () => {
  it.each([
    ["yyyy-MM-dd", "2026-09-23"],
    ["dd.MM.yyyy", "23.09.2026"],
    ["MM/dd/yyyy", "09/23/2026"],
  ])("renders the date preset %s as %s", (dateFormat, expected) => {
    expect(formatTimestamp(SAMPLE, "date", { dateFormat, timeFormat: "locale" }, EN)).toBe(expected);
  });

  it.each([
    ["hh:mm a", "02:05 PM"],
    ["HH:mm", "14:05"],
  ])("renders the time preset %s as %s", (timeFormat, expected) => {
    expect(formatTimestamp(SAMPLE, "time", { dateFormat: "locale", timeFormat }, EN)).toBe(expected);
  });

  it("renders a custom pattern beyond the presets", () => {
    expect(formatTimestamp(SAMPLE, "date", { dateFormat: "EEEE d MMMM", timeFormat: "locale" }, EN)).toBe(
      "Wednesday 23 September",
    );
  });

  it("localizes custom patterns with the Russian date-fns locale", () => {
    expect(formatTimestamp(SAMPLE, "date", { dateFormat: "d MMMM yyyy", timeFormat: "locale" }, RU)).toBe(
      "23 сентября 2026",
    );
  });
});

describe("formatTimestamp datetime joining", () => {
  it("joins two custom parts with a single space", () => {
    expect(formatTimestamp(SAMPLE, "datetime", { dateFormat: "dd.MM.yyyy", timeFormat: "HH:mm" }, EN)).toBe(
      "23.09.2026 14:05",
    );
  });

  it("keeps the long date when only the time format is custom", () => {
    const longDate = new Intl.DateTimeFormat(EN, { year: "numeric", month: "long", day: "numeric" }).format(SAMPLE);

    expect(formatTimestamp(SAMPLE, "datetime", { dateFormat: "locale", timeFormat: "HH:mm" }, EN)).toBe(
      `${longDate} 14:05`,
    );
  });

  it("joins a custom date with the datetime clock when only the date format is custom", () => {
    const datetimeClock = new Intl.DateTimeFormat(EN, { hour: "2-digit", minute: "2-digit" }).format(SAMPLE);

    expect(formatTimestamp(SAMPLE, "datetime", { dateFormat: "dd.MM.yyyy", timeFormat: "locale" }, EN)).toBe(
      `23.09.2026 ${datetimeClock}`,
    );
  });
});

describe("timeFieldFormatOptions", () => {
  it("leaves the cycle to the locale and keeps hours unpadded for the sentinel", () => {
    expect(timeFieldFormatOptions("locale")).toEqual({ shouldForceLeadingZeros: false });
  });

  it.each([
    ["h:mm a", { hourCycle: 12, shouldForceLeadingZeros: false }],
    ["hh:mm a", { hourCycle: 12, shouldForceLeadingZeros: true }],
    ["H:mm", { hourCycle: 24, shouldForceLeadingZeros: false }],
    ["HH:mm", { hourCycle: 24, shouldForceLeadingZeros: true }],
  ])("maps %s onto the time field", (pattern, expected) => {
    expect(timeFieldFormatOptions(pattern)).toEqual(expected);
  });

  it("ignores hour letters inside quotes", () => {
    expect(timeFieldFormatOptions("'h' HH:mm")).toEqual({ hourCycle: 24, shouldForceLeadingZeros: true });
  });

  it("leaves the cycle to the locale when the pattern has no hour token", () => {
    expect(timeFieldFormatOptions("mm")).toEqual({ shouldForceLeadingZeros: false });
  });
});

describe("formatTimestamp invalid-pattern fallback", () => {
  // WHY: "hello" throws inside date-fns (unescaped latin letters); validation rejects
  // it on write, so this only ever runs on hand-edited rows — the sentinel must win.
  it("falls back to the date sentinel", () => {
    const expected = new Intl.DateTimeFormat(EN, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(SAMPLE);

    expect(formatTimestamp(SAMPLE, "date", { dateFormat: "hello", timeFormat: "locale" }, EN)).toBe(expected);
  });

  it("falls back to the time sentinel", () => {
    const expected = new Intl.DateTimeFormat(EN, { hour: "numeric", minute: "2-digit" }).format(SAMPLE);

    expect(formatTimestamp(SAMPLE, "time", { dateFormat: "locale", timeFormat: "hello" }, EN)).toBe(expected);
  });

  it("falls back to the long date inside a mixed datetime", () => {
    const longDate = new Intl.DateTimeFormat(EN, { year: "numeric", month: "long", day: "numeric" }).format(SAMPLE);

    expect(formatTimestamp(SAMPLE, "datetime", { dateFormat: "hello", timeFormat: "HH:mm" }, EN)).toBe(
      `${longDate} 14:05`,
    );
  });
});
