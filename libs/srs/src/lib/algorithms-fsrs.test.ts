import { createEmptyCard, Rating } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import {
  algorithmFSRSValidation,
  createFSRSAlgorithm,
  DEFAULT_FSRS_ALGORITHM,
} from "./algorithms-fsrs";

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

    expect(lowGrades[Rating.Good].card.scheduled_days).toBeGreaterThan(
      highGrades[Rating.Good].card.scheduled_days,
    );
  });

  it("parses comma-separated weights string into number array", () => {
    const defaultInstance = createFSRSAlgorithm(DEFAULT_FSRS_ALGORITHM);
    const customInstance = createFSRSAlgorithm({
      ...DEFAULT_FSRS_ALGORITHM,
      weights: "0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3",
    });

    const now = new Date();
    const card = createReviewedCard(now);
    const defaultGrades = defaultInstance.repeat(card, now);
    const customGrades = customInstance.repeat(card, now);

    expect(defaultGrades[Rating.Good].card).not.toEqual(
      customGrades[Rating.Good].card,
    );
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

  it("rejects retention below 70", () => {
    const result = algorithmFSRSValidation.safeParse({
      ...DEFAULT_FSRS_ALGORITHM,
      retention: 50,
    });
    expect(result.success).toBe(false);
  });

  it("rejects retention above 99", () => {
    const result = algorithmFSRSValidation.safeParse({
      ...DEFAULT_FSRS_ALGORITHM,
      retention: 100,
    });
    expect(result.success).toBe(false);
  });

  it("accepts retention at boundaries", () => {
    expect(algorithmFSRSValidation.safeParse({ ...DEFAULT_FSRS_ALGORITHM, retention: 70 }).success).toBe(true);
    expect(algorithmFSRSValidation.safeParse({ ...DEFAULT_FSRS_ALGORITHM, retention: 99 }).success).toBe(true);
  });

  it("rejects non-literal type field", () => {
    const result = algorithmFSRSValidation.safeParse({
      ...DEFAULT_FSRS_ALGORITHM,
      type: "sm2" as const,
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

  it("rejects invalid learning step units", () => {
    const result = algorithmFSRSValidation.safeParse({
      ...DEFAULT_FSRS_ALGORITHM,
      learningSteps: [[1, "w"]],
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
