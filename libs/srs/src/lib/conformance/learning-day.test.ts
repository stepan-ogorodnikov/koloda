import { AppError } from "@koloda/app";
import { describe, expect, it } from "vitest";
import { getLearningDayRangeAt } from "../reviews";

type LearningDayOutput = { from: number; to: number };

type LearningDayCase = {
  name: string;
  input: { now: string; dayStartsAt: string };
  output?: LearningDayOutput;
  error?: string;
};

type LearningDayFixture = {
  schemaVersion: number;
  timeZone: string;
  cases: LearningDayCase[];
};

type SuccessCase = LearningDayCase & { output: LearningDayOutput };
type ErrorCase = LearningDayCase & { error: string };

const fixtures = import.meta.glob("../../../../../conformance/learning-day.*.json", {
  eager: true,
  import: "default",
}) as Record<string, LearningDayFixture>;

const processTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function isSuccessCase(fixtureCase: LearningDayCase): fixtureCase is SuccessCase {
  return fixtureCase.output !== undefined;
}

function isErrorCase(fixtureCase: LearningDayCase): fixtureCase is ErrorCase {
  return fixtureCase.error !== undefined;
}

function parseNow(now: string): Date {
  if (now.endsWith("Z")) {
    const instant = new Date(now);
    if (Number.isNaN(instant.getTime())) {
      throw new Error(`invalid now: ${now}`);
    }
    return instant;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(now);
  if (match === null) {
    throw new Error(`invalid now: ${now}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const seconds = Number(match[6]);

  // WHY: `new Date("2024-01-02T04:30:00")` is UTC in ES; local components match the process TZ.
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

function loadLearningDayCases(file: LearningDayFixture, source: string): LearningDayCase[] {
  if (file.schemaVersion !== 1) {
    throw new Error(`${source}: unsupported schemaVersion: ${file.schemaVersion}`);
  }

  if (file.timeZone === undefined || file.timeZone === "") {
    throw new Error(`${source}: learning-day fixture requires timeZone`);
  }

  for (const fixtureCase of file.cases) {
    if (isSuccessCase(fixtureCase) === isErrorCase(fixtureCase)) {
      throw new Error(`case "${fixtureCase.name}": exactly one of output or error is required`);
    }
  }

  return file.cases;
}

if (Object.keys(fixtures).length === 0) {
  throw new Error("expected at least one learning-day.*.json");
}

for (const source of Object.keys(fixtures).sort()) {
  const file = fixtures[source];
  const cases = loadLearningDayCases(file, source);

  describe.skipIf(file.timeZone !== processTimeZone)(`learning day goldens (${file.timeZone})`, () => {
    it.each(cases.filter(isSuccessCase))("$name", (fixtureCase) => {
      const range = getLearningDayRangeAt(parseNow(fixtureCase.input.now), fixtureCase.input.dayStartsAt);
      expect(Date.parse(range.from)).toBe(fixtureCase.output.from);
      expect(Date.parse(range.to)).toBe(fixtureCase.output.to);
    });

    it.each(cases.filter(isErrorCase))("$name", (fixtureCase) => {
      expect(() => getLearningDayRangeAt(parseNow(fixtureCase.input.now), fixtureCase.input.dayStartsAt)).toThrow(
        AppError,
      );
      expect(() => getLearningDayRangeAt(parseNow(fixtureCase.input.now), fixtureCase.input.dayStartsAt)).toThrow(
        fixtureCase.error,
      );
    });
  });
}
