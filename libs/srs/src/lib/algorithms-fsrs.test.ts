import { createEmptyCard, Rating, State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { algorithmFSRSValidation, createFSRSAlgorithm, DEFAULT_FSRS_ALGORITHM } from "./algorithms-fsrs";

function createReviewedCard(now: Date) {
  const card = createEmptyCard(now);
  card.state = 2;
  card.stability = 5;
  card.difficulty = 3;
  card.reps = 3;
  card.elapsed_days = 5;
  card.scheduled_days = 7;
  return card;
}

function validPayload() {
  return {
    type: "fsrs" as const,
    retention: 90,
    weights: "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
    isFuzzEnabled: true,
    learningSteps: [] as Array<[number, string]>,
    relearningSteps: [] as Array<[number, string]>,
    maximumInterval: 36500,
  };
}

describe("createFSRSAlgorithm", () => {
  it("returns a working fsrs instance from the default algorithm", () => {
    const instance = createFSRSAlgorithm(DEFAULT_FSRS_ALGORITHM);
    const card = createEmptyCard(new Date());
    const grades = instance.repeat(card, new Date());

    expect(grades[Rating.Again]).toBeDefined();
    expect(grades[Rating.Hard]).toBeDefined();
    expect(grades[Rating.Good]).toBeDefined();
    expect(grades[Rating.Easy]).toBeDefined();
  });

  it("divides retention by 100 before passing to generatorParameters", () => {
    const lowRetention = createFSRSAlgorithm({ ...DEFAULT_FSRS_ALGORITHM, retention: 70 });
    const highRetention = createFSRSAlgorithm({ ...DEFAULT_FSRS_ALGORITHM, retention: 99 });

    const now = new Date();
    const card = createReviewedCard(now);
    const lowGrades = lowRetention.repeat(card, now);
    const highGrades = highRetention.repeat(card, now);

    expect(lowGrades[Rating.Good].card.scheduled_days).toBeGreaterThan(highGrades[Rating.Good].card.scheduled_days);
  });

  it("parses comma-separated weights string into number array", () => {
    const defaultInstance = createFSRSAlgorithm(DEFAULT_FSRS_ALGORITHM);
    const customInstance = createFSRSAlgorithm({
      ...DEFAULT_FSRS_ALGORITHM,
      weights:
        "0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3",
    });

    const now = new Date();
    const card = createReviewedCard(now);
    const defaultGrades = defaultInstance.repeat(card, now);
    const customGrades = customInstance.repeat(card, now);

    expect(defaultGrades[Rating.Good].card).not.toEqual(customGrades[Rating.Good].card);
  });

  it("applies maximumInterval to cap scheduled intervals", () => {
    const shortMax = createFSRSAlgorithm({ ...DEFAULT_FSRS_ALGORITHM, maximumInterval: 10 });
    const longMax = createFSRSAlgorithm({ ...DEFAULT_FSRS_ALGORITHM, maximumInterval: 36500 });

    const now = new Date();
    const card = createReviewedCard(now);
    card.stability = 100;

    const shortGrades = shortMax.repeat(card, now);
    const longGrades = longMax.repeat(card, now);

    const shortInterval = shortGrades[Rating.Good].card.scheduled_days;
    const longInterval = longGrades[Rating.Good].card.scheduled_days;

    expect(shortInterval).toBeLessThan(longInterval);
    expect(shortInterval).toBeLessThanOrEqual(15);
  });

  it("pins a new card graded Easy to Review with an eight-day interval", () => {
    // WHY: Fuzz off so the interval math is deterministic and pinnable.
    const instance = createFSRSAlgorithm({ ...DEFAULT_FSRS_ALGORITHM, isFuzzEnabled: false });
    const now = new Date("2026-08-24T12:00:00.000Z");
    const card = createEmptyCard(now);

    const easy = instance.repeat(card, now)[Rating.Easy].card;

    expect(easy.state).toBe(State.Review);
    expect(easy.scheduled_days).toBe(8);
    expect(+easy.due - +now).toBe(8 * 86_400_000);
    expect(easy.stability).toBeCloseTo(8.2956, 5); // initial stability w[3]
    expect(easy.difficulty).toBe(1); // initial difficulty clamped to the [1, 10] floor
  });

  it("pins Again on a learning card to the first one-minute learning step", () => {
    // WHY: Fuzz off so the interval math is deterministic and pinnable.
    const instance = createFSRSAlgorithm({ ...DEFAULT_FSRS_ALGORITHM, isFuzzEnabled: false });
    const now = new Date("2026-08-24T12:00:00.000Z");
    // Good on a new card leaves it in Learning, due at the second learning step (10m).
    const learningCard = instance.repeat(createEmptyCard(now), now)[Rating.Good].card;
    expect(learningCard.state).toBe(State.Learning);

    const reviewedAt = learningCard.due;
    const again = instance.repeat(learningCard, reviewedAt)[Rating.Again].card;

    expect(again.state).toBe(State.Learning);
    expect(+again.due - +reviewedAt).toBe(60_000);
    expect(again.stability).toBeCloseTo(0.77508398, 5);
    expect(again.difficulty).toBeCloseTo(7.39450274, 5);
  });

  it("passes learning and relearning steps to ts-fsrs as step-unit strings", () => {
    const instance = createFSRSAlgorithm({
      ...DEFAULT_FSRS_ALGORITHM,
      learningSteps: [
        [5, "s"],
        [2, "h"],
      ],
      relearningSteps: [[1, "d"]],
    });

    expect(instance.parameters.learning_steps).toEqual(["5s", "2h"]);
    expect(instance.parameters.relearning_steps).toEqual(["1d"]);
  });

  it("uses fuzz setting from algorithm data", () => {
    const fuzzy = createFSRSAlgorithm({ ...DEFAULT_FSRS_ALGORITHM, isFuzzEnabled: true });
    const noFuzz = createFSRSAlgorithm({ ...DEFAULT_FSRS_ALGORITHM, isFuzzEnabled: false });

    const now = new Date();
    const card = createEmptyCard(now);
    const fuzzyGrades = fuzzy.repeat(card, now);
    const noFuzzGrades = noFuzz.repeat(card, now);

    expect(fuzzyGrades[Rating.Good].card.due).toBeInstanceOf(Date);
    expect(noFuzzGrades[Rating.Good].card.due).toBeInstanceOf(Date);
    expect(fuzzyGrades[Rating.Good].card.stability).toBeGreaterThan(0);
    expect(noFuzzGrades[Rating.Good].card.stability).toBeGreaterThan(0);
  });
});

describe("algorithmFSRSValidation", () => {
  it("accepts valid default algorithm data", () => {
    const result = algorithmFSRSValidation.safeParse(DEFAULT_FSRS_ALGORITHM);
    expect(result.success).toBe(true);
  });

  it("accepts the canonical valid payload", () => {
    const result = algorithmFSRSValidation.safeParse(validPayload());
    expect(result.success).toBe(true);
  });

  it("accepts retention at boundaries", () => {
    expect(algorithmFSRSValidation.safeParse({ ...validPayload(), retention: 70 }).success).toBe(true);
    expect(algorithmFSRSValidation.safeParse({ ...validPayload(), retention: 99 }).success).toBe(true);
  });

  it("accepts exactly 21 weights", () => {
    const result = algorithmFSRSValidation.safeParse({
      ...validPayload(),
      weights: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21",
    });
    expect(result.success).toBe(true);
  });

  it("accepts weights with spaces", () => {
    const result = algorithmFSRSValidation.safeParse({
      ...validPayload(),
      weights:
        "0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5",
    });
    expect(result.success).toBe(true);
  });

  it.each(["s", "m", "h", "d"])("accepts learning step unit %s", (unit) => {
    const result = algorithmFSRSValidation.safeParse({
      ...validPayload(),
      learningSteps: [[10, unit]],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty learning and relearning step arrays", () => {
    const result = algorithmFSRSValidation.safeParse(validPayload());
    expect(result.success).toBe(true);
  });

  it("accepts valid relearning steps", () => {
    const result = algorithmFSRSValidation.safeParse({
      ...validPayload(),
      relearningSteps: [
        [10, "m"],
        [1, "d"],
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts maximum interval at minimum and large values", () => {
    expect(algorithmFSRSValidation.safeParse({ ...validPayload(), maximumInterval: 1 }).success).toBe(true);
    expect(algorithmFSRSValidation.safeParse({ ...validPayload(), maximumInterval: 365000 }).success).toBe(true);
  });

  it("accepts isFuzzEnabled true and false", () => {
    expect(algorithmFSRSValidation.safeParse({ ...validPayload(), isFuzzEnabled: true }).success).toBe(true);
    expect(algorithmFSRSValidation.safeParse({ ...validPayload(), isFuzzEnabled: false }).success).toBe(true);
  });

  it.each([
    {
      name: "retention below minimum",
      payload: { ...validPayload(), retention: 69.9 },
      code: "validation.algorithm.fsrs.retention",
    },
    {
      name: "retention above maximum",
      payload: { ...validPayload(), retention: 99.1 },
      code: "validation.algorithm.fsrs.retention",
    },
    {
      name: "retention non-integer",
      payload: { ...validPayload(), retention: 90.5 },
      code: "validation.algorithm.fsrs.retention",
    },
    {
      name: "retention in-range non-integer",
      payload: { ...validPayload(), retention: 70.5 },
      code: "validation.algorithm.fsrs.retention",
    },
    {
      name: "learning step zero amount",
      payload: { ...validPayload(), learningSteps: [[0, "m"]] },
      code: "validation.algorithm.fsrs.learning-steps.amount",
    },
    {
      name: "learning step negative amount",
      payload: { ...validPayload(), learningSteps: [[-1, "m"]] },
      code: "validation.algorithm.fsrs.learning-steps.amount",
    },
    {
      name: "learning step invalid unit",
      payload: { ...validPayload(), learningSteps: [[10, "x"]] },
      code: "validation.algorithm.fsrs.learning-steps.unit",
    },
    {
      name: "relearning step zero amount",
      payload: { ...validPayload(), relearningSteps: [[0, "m"]] },
      code: "validation.algorithm.fsrs.relearning-steps.amount",
    },
    {
      name: "relearning step invalid unit",
      payload: { ...validPayload(), relearningSteps: [[10, "week"]] },
      code: "validation.algorithm.fsrs.relearning-steps.unit",
    },
    {
      name: "maximum interval zero",
      payload: { ...validPayload(), maximumInterval: 0 },
      code: "validation.algorithm.fsrs.maximum-interval",
    },
    {
      name: "maximum interval negative",
      payload: { ...validPayload(), maximumInterval: -1 },
      code: "validation.algorithm.fsrs.maximum-interval",
    },
    {
      name: "weights too few values",
      payload: { ...validPayload(), weights: "0.5,0.5,0.5" },
      code: "validation.algorithm.fsrs.weights",
    },
    {
      name: "weights too many values",
      payload: {
        ...validPayload(),
        weights: "0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
      },
      code: "validation.algorithm.fsrs.weights",
    },
    {
      name: "weights non-numeric",
      payload: {
        ...validPayload(),
        weights: "0.5,invalid,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
      },
      code: "validation.algorithm.fsrs.weights",
    },
    {
      name: "weights all Infinity",
      payload: {
        ...validPayload(),
        weights:
          "Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity",
      },
      code: "validation.algorithm.fsrs.weights",
    },
    {
      name: "weights negative Infinity among valid",
      payload: {
        ...validPayload(),
        weights: "0.5,-Infinity,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
      },
      code: "validation.algorithm.fsrs.weights",
    },
    {
      name: "weights NaN among valid",
      payload: {
        ...validPayload(),
        weights: "0.5,NaN,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5",
      },
      code: "validation.algorithm.fsrs.weights",
    },
    {
      name: "weights empty string",
      payload: { ...validPayload(), weights: "" },
      code: "validation.algorithm.fsrs.weights",
    },
  ])("rejects $name with $code", ({ payload, code }) => {
    const result = algorithmFSRSValidation.safeParse(payload);
    expect(result.success).toBe(false);
    const issues = result.success ? [] : result.error.issues;
    expect(issues.some((issue) => issue.message === code)).toBe(true);
  });

  it("rejects non-literal type field", () => {
    const result = algorithmFSRSValidation.safeParse({
      ...DEFAULT_FSRS_ALGORITHM,
      type: "sm2",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean isFuzzEnabled", () => {
    const result = algorithmFSRSValidation.safeParse({
      ...DEFAULT_FSRS_ALGORITHM,
      isFuzzEnabled: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer learning step amounts", () => {
    const result = algorithmFSRSValidation.safeParse({
      ...DEFAULT_FSRS_ALGORITHM,
      learningSteps: [[1.5, "m"]],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-array learning steps", () => {
    const result = algorithmFSRSValidation.safeParse({
      ...DEFAULT_FSRS_ALGORITHM,
      learningSteps: "1m, 10m",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing weights string", () => {
    const result = algorithmFSRSValidation.safeParse({
      ...DEFAULT_FSRS_ALGORITHM,
      weights: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric maximumInterval", () => {
    const result = algorithmFSRSValidation.safeParse({
      ...DEFAULT_FSRS_ALGORITHM,
      maximumInterval: "36500",
    });
    expect(result.success).toBe(false);
  });
});
