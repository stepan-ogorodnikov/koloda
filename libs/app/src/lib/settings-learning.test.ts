import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEARNING_SETTINGS,
  learningSettingsValidation,
  resolvedLearningSettingsValidation,
} from "./settings-learning";

describe("learningSettingsValidation", () => {
  it("provides default daily limits when empty", () => {
    const result = learningSettingsValidation.parse({
      defaults: { algorithm: 1, template: 1 },
      dailyLimits: {},
    });

    expect(result.dailyLimits).toEqual({
      total: 200,
      untouched: { value: 50, counts: true },
      learn: { value: 0, counts: false },
      review: { value: 200, counts: true },
    });
  });

  it("coerces a plain number to { value, counts: true } for daily limit types", () => {
    const result = learningSettingsValidation.parse({
      defaults: { algorithm: 1, template: 1 },
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
      defaults: { algorithm: 1, template: 1 },
      dailyLimits: {},
    });
    expect(result.dayStartsAt).toBe("05:00");
  });

  it("defaults learnAheadLimit to [0, 30]", () => {
    const result = learningSettingsValidation.parse({
      defaults: { algorithm: 1, template: 1 },
      dailyLimits: {},
    });
    expect(result.learnAheadLimit).toEqual([0, 30]);
  });

  it("accepts custom valid daily limits", () => {
    const result = learningSettingsValidation.parse({
      defaults: { algorithm: 1, template: 1 },
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
      defaults: { algorithm: 0, template: 0 },
      dailyLimits: {
        total: 200,
        untouched: { value: 50, counts: true },
        learn: { value: 0, counts: false },
        review: { value: 200, counts: true },
      },
      dayStartsAt: "05:00",
      learnAheadLimit: [0, 30],
    });
  });
});

describe("daily limits refine rules", () => {
  const defaults = { algorithm: 1, template: 1 };

  it("allows any sub-limit values when total is 0", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        total: 0,
        untouched: { value: 999, counts: true },
        learn: { value: 999, counts: true },
        review: { value: 999, counts: true },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects untouched.value > total when counts is true", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        total: 10,
        untouched: { value: 20, counts: true },
      },
    });
    expect(result.success).toBe(false);
  });

  it("allows untouched.value > total when counts is false", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        total: 10,
        untouched: { value: 20, counts: false },
        review: { value: 10, counts: true },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects learn.value > total when counts is true", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        total: 10,
        learn: { value: 15, counts: true },
        review: { value: 10, counts: true },
      },
    });
    expect(result.success).toBe(false);
  });

  it("allows learn.value > total when counts is false", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        total: 10,
        untouched: { value: 10, counts: true },
        learn: { value: 15, counts: false },
        review: { value: 10, counts: true },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects review.value > total when counts is true", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        total: 10,
        review: { value: 15, counts: true },
        untouched: { value: 10, counts: true },
      },
    });
    expect(result.success).toBe(false);
  });

  it("allows review.value > total when counts is false", () => {
    const result = learningSettingsValidation.safeParse({
      defaults,
      dailyLimits: {
        total: 10,
        review: { value: 15, counts: false },
        untouched: { value: 10, counts: true },
      },
    });
    expect(result.success).toBe(true);
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
  const defaults = { algorithm: 1, template: 1 };

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
});

describe("resolvedLearningSettingsValidation", () => {
  it("has no defaults — missing fields cause failure", () => {
    const result = resolvedLearningSettingsValidation.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a fully specified object", () => {
    const result = resolvedLearningSettingsValidation.safeParse({
      defaults: { algorithm: 1, template: 1 },
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
});

describe("negative daily limit values", () => {
  const defaults = { algorithm: 1, template: 1 };

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
