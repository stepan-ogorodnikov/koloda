import { describe, expect, it } from "vitest";
import fixture from "../../../../../conformance/day-starts-at.json" with { type: "json" };
import { AppError } from "../error";
import { parseDayStartsAt } from "../settings-learning";

type DayStartsAtOutput = { hours: number; minutes: number };

type DayStartsAtCase = {
  name: string;
  input: { dayStartsAt: string };
  output?: DayStartsAtOutput;
  error?: string;
};

type DayStartsAtFixture = {
  schemaVersion: number;
  cases: DayStartsAtCase[];
};

type SuccessCase = DayStartsAtCase & { output: DayStartsAtOutput };
type ErrorCase = DayStartsAtCase & { error: string };

function isSuccessCase(fixtureCase: DayStartsAtCase): fixtureCase is SuccessCase {
  return fixtureCase.output !== undefined;
}

function isErrorCase(fixtureCase: DayStartsAtCase): fixtureCase is ErrorCase {
  return fixtureCase.error !== undefined;
}

function loadDayStartsAtCases(file: DayStartsAtFixture): DayStartsAtCase[] {
  if (file.schemaVersion !== 1) {
    throw new Error(`unsupported schemaVersion: ${file.schemaVersion}`);
  }

  for (const fixtureCase of file.cases) {
    if (isSuccessCase(fixtureCase) === isErrorCase(fixtureCase)) {
      throw new Error(`case "${fixtureCase.name}": exactly one of output or error is required`);
    }
  }

  return file.cases;
}

const cases = loadDayStartsAtCases(fixture);

describe("dayStartsAt goldens", () => {
  it.each(cases.filter(isSuccessCase))("$name", (fixtureCase) => {
    expect(parseDayStartsAt(fixtureCase.input.dayStartsAt)).toEqual(fixtureCase.output);
  });

  it.each(cases.filter(isErrorCase))("$name", (fixtureCase) => {
    expect(() => parseDayStartsAt(fixtureCase.input.dayStartsAt)).toThrow(AppError);
    expect(() => parseDayStartsAt(fixtureCase.input.dayStartsAt)).toThrow(fixtureCase.error);
  });
});
