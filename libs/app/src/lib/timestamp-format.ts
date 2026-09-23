import { format } from "date-fns";
import type { Locale } from "date-fns";
import { enUS, ru } from "date-fns/locale";

export type TimestampKind = "date" | "datetime" | "time";

export type TimestampFormats = {
  dateFormat: string;
  timeFormat: string;
};

export type TimestampFormatter = (date: Date, kind: TimestampKind) => string;

// WHY: the sentinel option sets replicate byte-for-byte what the call sites rendered
// before the setting existed (mapping pinned in timestamp-format.test.ts). Do not
// "simplify" them to dateStyle/timeStyle shortcuts — those rephrase the join per
// locale ("at", "г. в") and would change default rendering.
const NUMERIC_DATE_OPTIONS: Intl.DateTimeFormatOptions = { year: "numeric", month: "numeric", day: "numeric" };
const LONG_DATE_OPTIONS: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };
const CLOCK_TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
const DATETIME_TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
const LONG_DATETIME_OPTIONS: Intl.DateTimeFormatOptions = { ...LONG_DATE_OPTIONS, ...DATETIME_TIME_OPTIONS };

function dateFnsLocale(locale: string): Locale {
  return locale === "ru" ? ru : enUS;
}

function renderPart(date: Date, pattern: string, locale: string, sentinel: Intl.DateTimeFormatOptions): string {
  if (pattern === "locale") return new Intl.DateTimeFormat(locale, sentinel).format(date);

  try {
    return format(date, pattern, { locale: dateFnsLocale(locale) });
  } catch {
    // WHY: validation rejects invalid patterns on write, but a hand-edited settings row
    // can still hold one; falling back to the sentinel keeps renders alive. Only the
    // pattern formatting is wrapped — nothing else is swallowed here.
    return new Intl.DateTimeFormat(locale, sentinel).format(date);
  }
}

export type TimeFieldFormatOptions = {
  hourCycle?: 12 | 24;
  shouldForceLeadingZeros: boolean;
};

// WHY: a time field can only express a 12/24 cycle and hour padding, not an arbitrary
// date-fns pattern. The first unquoted h/H run is the part it can honor. "locale" and
// patterns with no hour token leave the cycle to the locale and keep hours unpadded,
// matching the clock used for time renders (hour: "numeric"). Quoted letters are
// literals, same as isValidTimestampPattern.
export function timeFieldFormatOptions(pattern: string): TimeFieldFormatOptions {
  const characters = [...pattern];
  let inQuote = false;

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (character === "'") {
      if (characters[index + 1] === "'") {
        index += 1;
        continue;
      }
      inQuote = !inQuote;
      continue;
    }
    if (inQuote || (character !== "h" && character !== "H")) continue;

    let length = 1;
    while (characters[index + length] === character) length += 1;
    return {
      hourCycle: character === "h" ? 12 : 24,
      shouldForceLeadingZeros: length > 1,
    };
  }

  return { shouldForceLeadingZeros: false };
}

export function formatTimestamp(date: Date, kind: TimestampKind, formats: TimestampFormats, locale: string): string {
  if (kind === "date") return renderPart(date, formats.dateFormat, locale, NUMERIC_DATE_OPTIONS);
  if (kind === "time") return renderPart(date, formats.timeFormat, locale, CLOCK_TIME_OPTIONS);

  // WHY: with both formats on the sentinel, one Intl call reproduces the combined
  // card-details rendering exactly; joining two sentinel parts would drop the locale's
  // own join ("at", "г. в") and change default rendering. Mixed renders join the
  // rendered parts with a single space instead.
  if (formats.dateFormat === "locale" && formats.timeFormat === "locale") {
    return new Intl.DateTimeFormat(locale, LONG_DATETIME_OPTIONS).format(date);
  }

  const datePart = renderPart(date, formats.dateFormat, locale, LONG_DATE_OPTIONS);
  const timePart = renderPart(date, formats.timeFormat, locale, DATETIME_TIME_OPTIONS);
  return `${datePart} ${timePart}`;
}
