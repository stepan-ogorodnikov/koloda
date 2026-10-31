import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEARNING_SETTINGS,
  learningSettingsValidation,
  parseDayStartsAt,
  resolvedLearningSettingsValidation,
} from "./settings-learning";

const defaults = {
  algorithm: "01900000-0000-7000-8000-000000000001",
  template: "01900000-0000-7000-8000-000000000002",
};

describe("parseDayStartsAt", () => {
  it.each([
    { name: "00:00", input: "00:00", hours: 0, minutes: 0 },
    { name: "05:00", input: "05:00", hours: 5, minutes: 0 },
    { name: "23:59", input: "23:59", hours: 23, minutes: 59 },
  ])("returns hours and minutes for $name", ({ input, hours, minutes }) => {
    expect(parseDayStartsAt(input)).toEqual({ hours, minutes });
  });
});

describe("learningSettingsValidation", () => {
  it("provides default daily limits when empty", () => {
    const result = learningSettingsValidation.parse({
      defaults,
      dailyLimits: {},
    });

    expect(result.dailyLimits).toEqual({
      total: 200,
      untouched: { value: 50, counts: true },
      learn: { value: null, counts: false },
      review: { value: 200, counts: true },
    });
  });

  it("fills per-type defaults for empty limit objects (twin of Rust serde defaults)", () => {
    const result = learningSettingsValidation.parse({
      defaults,
      dailyLimits: { untouched: {}, learn: {}, review: {} },
    });

    expect(result.dailyLimits).toEqual({
      total: 200,
      untouched: { value: 50, counts: true },
      learn: { value: null, counts: false },
      review: { value: 200, counts: true },
    });
  });

  it("fills missing counts with the per-type default (twin of Rust deserialize_*_limit)", () => {
    const result = learningSettingsValidation.parse({
      defaults,
      dailyLimits: {
        learn: { value: 5 },
        untouched: { value: 5 },
      },
    });

    expect(result.dailyLimits.learn).toEqual({ value: 5, counts: false });
    expect(result.dailyLimits.untouched).toEqual({ value: 5, counts: true });
  });

  it("fills defaults for null limit values (twin of Rust null handling)", () => {
    const result = learningSettingsValidation.parse({
      defaults,
      dailyLimits: { untouched: null },
    });

    expect(result.dailyLimits.untouched).toEqual({ value: 50, counts: true });
  });

  it("coerces a plain number to { value, counts: true } for daily limit types", () => {
    const result = learningSettingsValidation.parse({
      defaults,
      dailyLimits: {
        untouched: 10,
        learn: 5,
        review: 20,
      },
    });

    expect(result.dailyLimits.untouched).toEqual({ value: 10, counts: true });
    expect(result.dailyLimits.learn).toEqual({ value: 5, counts: true });
    expect(result.dailyLimits.review).toEqual({ value: 20, counts: true });
  });

  it("defaults dayStartsAt to '05:00'", () => {
    const result = learningSettingsValidation.parse({
      defaults,
      dailyLimits: {},
    });
    expect(result.dayStartsAt).toBe("05:00");
  });

  it("defaults learnAheadLimit to [0, 30]", () => {
    const result = learningSettingsValidation.parse({
      defaults,
      dailyLimits: {},
    });
    expect(result.learnAheadLimit).toEqual([0, 30]);
  });

  it("accepts custom valid daily limits", () => {
    const result = learningSettingsValidation.parse({
      defaults,
      dailyLimits: {
        total: 100,
        untouched: { value: 50, counts: true },
        learn: { value: 20, counts: false },
        review: { value: 80, counts: true },
      },
    });

    expect(result.dailyLimits).toEqual({
      total: 100,
      untouched: { value: 50, counts: true },
      learn: { value: 20, counts: false },
      review: { value: 80, counts: true },
    });
  });

  it("accepts default preset via DEFAULT_LEARNING_SETTINGS", () => {
    expect(DEFAULT_LEARNING_SETTINGS).toEqual({
      defaults: {
        algorithm: "01a08376-dc00-7001-8000-000000000100",
        template: "01a08376-dc00-7003-8000-000000000300",
      },
      dailyLimits: {
        total: 200,
        untouched: { value: 50, counts: true },
        learn: { value: null, counts: false },
        review: { value: 200, counts: true },
      },
      dayStartsAt: "05:00",
      learnAheadLimit: [0, 30],
    });
  });

  // Twin of koloda `test_defaults_non_uuid_algorithm_fails` — desktop `LearningDefaults::validate`
  // rejects the same shapes.
  it("rejects non-uuid default ids", () => {
    const result = learningSettingsValidation.safeParse({
      defaults: { algorithm: "simple", template: defaults.template },
      dailyLimits: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("daily limits refine rules", () => {
  it("allows any sub-limit values when total is null", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        total: null,
        untouched: { value: 999, counts: true },
        learn: { value: 999, counts: true },
        review: { value: 999, counts: true },
      },
    });
    expect(result.success).toBe(true);
  });

  // Twin of koloda `test_daily_limits_zero_total_is_a_hard_cap`.
  it("keeps a stored total of 0 as a hard cap on the defaulting schema", () => {
    const result = learningSettingsValidation.parse({
      defaults,
      dailyLimits: {
        total: 0,
        untouched: { value: 0, counts: true },
        learn: { value: 0, counts: true },
        review: { value: 0, counts: true },
      },
    });
    expect(result.dailyLimits.total).toBe(0);
  });

  // Twin of koloda `test_daily_limits_hard_zero_total_rejects_counted_values`.
  it("rejects counted values above a hard-zero total on the defaulting schema", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        total: 0,
        untouched: { value: 1, counts: true },
        learn: { value: 0, counts: false },
        review: { value: 0, counts: true },
      },
      dayStartsAt: "05:00",
      learnAheadLimit: [0, 30],
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "validation.settings-learning.daily-limits.untouched-exceeds-total",
    ]);
  });

  it("allows unlimited per-type values when total is finite", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        total: 10,
        untouched: { value: null, counts: true },
        learn: { value: 5, counts: true },
        review: { value: 5, counts: true },
      },
    });
    expect(result.success).toBe(true);
  });

  // Twin of koloda `test_daily_limits_*_exceeds_total_fails`: every other cap sits at Total with counts on,
  // so only the row's cap can break a rule.
  it.each([
    { type: "untouched", counts: true, code: "validation.settings-learning.daily-limits.untouched-exceeds-total" },
    { type: "untouched", counts: false, code: undefined },
    { type: "learn", counts: true, code: "validation.settings-learning.daily-limits.learn-exceeds-total" },
    { type: "learn", counts: false, code: undefined },
    { type: "review", counts: true, code: "validation.settings-learning.daily-limits.review-exceeds-total" },
    { type: "review", counts: false, code: undefined },
  ] as const)("checks $type one past total with counts $counts", ({ type, counts, code }) => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        total: 10,
        untouched: { value: 10, counts: true },
        learn: { value: 10, counts: true },
        review: { value: 10, counts: true },
        [type]: { value: 11, counts },
      },
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(code ? [code] : undefined);
  });

  it("allows value equal to total when counts is true", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        total: 10,
        untouched: { value: 10, counts: true },
        learn: { value: 10, counts: true },
        review: { value: 10, counts: true },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("learn ahead limit validation", () => {
  it("accepts hours at boundary 0", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {},
      learnAheadLimit: [0, 30],
    });
    expect(result.success).toBe(true);
  });

  it("accepts hours at boundary 48", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {},
      learnAheadLimit: [48, 0],
    });
    expect(result.success).toBe(true);
  });

  it("rejects hours above 48", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {},
      learnAheadLimit: [49, 0],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative hours", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {},
      learnAheadLimit: [-1, 0],
    });
    expect(result.success).toBe(false);
  });

  it("rejects minutes above 59", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {},
      learnAheadLimit: [0, 60],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative minutes", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {},
      learnAheadLimit: [0, -1],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid dayStartsAt format", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {},
      dayStartsAt: "25:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unpadded dayStartsAt hours", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {},
      dayStartsAt: "5:00",
    });
    expect(result.success).toBe(false);
  });
});

describe("resolvedLearningSettingsValidation", () => {
  it("has no defaults — missing fields cause failure", () => {
    const result = resolvedLearningSettingsValidation.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a fully specified object", () => {
    const result = resolvedLearningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        total: 200,
        untouched: { value: 50, counts: true },
        learn: { value: 0, counts: false },
        review: { value: 200, counts: true },
      },
      dayStartsAt: "05:00",
      learnAheadLimit: [0, 30],
    });
    expect(result.success).toBe(true);
  });

  it("keeps a resolved total of 0 as a hard cap", () => {
    const result = resolvedLearningSettingsValidation.parse({
      defaults,
      dailyLimits: {
        total: 0,
        untouched: { value: 0, counts: true },
        learn: { value: 0, counts: false },
        review: { value: 0, counts: true },
      },
      dayStartsAt: "05:00",
      learnAheadLimit: [0, 30],
    });
    expect(result.dailyLimits.total).toBe(0);
  });
});

describe("negative daily limit values", () => {
  it("rejects negative total", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: { total: -1 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative untouched value", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        untouched: { value: -1, counts: true },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative learn value", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        learn: { value: -1, counts: true },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative review value", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        review: { value: -1, counts: true },
      },
    });
    expect(result.success).toBe(false);
  });
});

// Twin of koloda `fractional_limits_are_refused`.
describe("fractional limit values", () => {
  const dailyLimits = {
    total: 100,
    untouched: { value: 20, counts: true },
    learn: { value: 30, counts: true },
    review: { value: 50, counts: true },
  };
  const cases = [
    { field: "total", input: { dailyLimits: { ...dailyLimits, total: 1.5 } } },
    { field: "untouched value", input: { dailyLimits: { ...dailyLimits, untouched: { value: 1.5, counts: true } } } },
    { field: "learn-ahead hours", input: { learnAheadLimit: [1.5, 30] } },
    { field: "learn-ahead minutes", input: { learnAheadLimit: [4, 1.5] } },
  ];

  it.each(
    cases.flatMap((item) => [
      { ...item, schemaName: "defaulting", schema: learningSettingsValidation },
      { ...item, schemaName: "resolved", schema: resolvedLearningSettingsValidation },
    ]),
  )("rejects $field = 1.5 on the $schemaName schema", ({ input, schema }) => {
    const result = schema.safeParse({ defaults, dailyLimits, dayStartsAt: "05:00", learnAheadLimit: [4, 0], ...input });
    expect(result.success).toBe(false);
  });
});
