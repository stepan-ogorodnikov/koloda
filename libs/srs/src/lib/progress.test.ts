import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { cardRowSchema, cardValidation, insertCardSchema } from "./cards";
import { insertReviewSchema, reviewValidation } from "./reviews";

const DEFAULT_DATE = new Date("2024-01-01T00:00:00.000Z");

function firstIssueMessage<T>(result: z.SafeParseReturnType<T, T>): string | undefined {
  if (result.success) return undefined;
  return result.error.issues[0]?.message;
}

function validCardProgress(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    deckId: 1,
    templateId: 1,
    content: { "1": { text: "Question" } },
    state: 0,
    dueAt: null,
    stability: 5.0,
    difficulty: 5.0,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
    ...overrides,
  };
}

function validInsertCard(overrides: Record<string, unknown> = {}) {
  const { id: _id, ...rest } = validCardProgress(overrides);
  return rest;
}

function validReview(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    cardId: 1,
    rating: 1,
    state: 0,
    dueAt: DEFAULT_DATE,
    stability: 5.0,
    difficulty: 5.0,
    scheduledDays: 1,
    learningSteps: 0,
    time: 0,
    isIgnored: false,
    createdAt: DEFAULT_DATE,
    ...overrides,
  };
}

function validInsertReview(overrides: Record<string, unknown> = {}) {
  const { id: _id, ...rest } = validReview(overrides);
  return rest;
}

describe("card progress validation", () => {
  it("accepts a canonical valid card payload", () => {
    expect(cardValidation.safeParse(validCardProgress()).success).toBe(true);
    expect(insertCardSchema.safeParse(validInsertCard()).success).toBe(true);
  });

  it("rejects out-of-bounds progress values with field-specific codes", () => {
    const cases: Array<[string, unknown, string]> = [
      ["state", -1, "validation.cards-progress.state"],
      ["state", 4, "validation.cards-progress.state"],
      ["stability", -1.0, "validation.cards-progress.stability"],
      ["difficulty", -0.1, "validation.cards-progress.difficulty"],
      ["difficulty", 10.1, "validation.cards-progress.difficulty"],
      ["scheduledDays", -1, "validation.cards-progress.scheduled-days"],
      ["learningSteps", -1, "validation.cards-progress.learning-steps"],
      ["reps", -1, "validation.cards-progress.reps"],
      ["lapses", -1, "validation.cards-progress.lapses"],
    ];

    for (const [field, offending, code] of cases) {
      const result = cardValidation.safeParse(validCardProgress({ [field]: offending }));
      expect(firstIssueMessage(result), `${field} = ${offending}`).toBe(code);
    }
  });

  it("accepts boundary progress values", () => {
    const cases: Array<[string, unknown]> = [
      ["stability", 0.0],
      ["difficulty", 0.0],
      ["difficulty", 10.0],
      ["scheduledDays", 0],
      ["learningSteps", 0],
      ["reps", 0],
      ["lapses", 0],
    ];

    for (const [field, value] of cases) {
      const result = cardValidation.safeParse(validCardProgress({ [field]: value }));
      expect(result.success, `${field} = ${value}`).toBe(true);
    }
  });

  it("defaults omitted stability and difficulty to 0", () => {
    const { stability: _s, difficulty: _d, ...insertWithout } = validInsertCard();
    const inserted = insertCardSchema.parse(insertWithout);
    expect(inserted.stability).toBe(0);
    expect(inserted.difficulty).toBe(0);

    const { stability: _rowS, difficulty: _rowD, ...rowWithout } = validCardProgress();
    const row = cardRowSchema.parse({ ...rowWithout, createdAt: DEFAULT_DATE, updatedAt: null });
    expect(row.stability).toBe(0);
    expect(row.difficulty).toBe(0);
  });

  it("rejects null stability and difficulty", () => {
    expect(cardValidation.safeParse(validCardProgress({ stability: null })).success).toBe(false);
    expect(cardValidation.safeParse(validCardProgress({ difficulty: null })).success).toBe(false);
    expect(
      cardRowSchema.safeParse({
        ...validCardProgress({ stability: null }),
        createdAt: DEFAULT_DATE,
        updatedAt: null,
      }).success,
    ).toBe(false);
    expect(
      cardRowSchema.safeParse({
        ...validCardProgress({ difficulty: null }),
        createdAt: DEFAULT_DATE,
        updatedAt: null,
      }).success,
    ).toBe(false);
  });
});

describe("review validation", () => {
  it("accepts a canonical valid review payload", () => {
    expect(reviewValidation.safeParse(validReview()).success).toBe(true);
    expect(insertReviewSchema.safeParse(validInsertReview()).success).toBe(true);
  });

  it("accepts all valid ratings (1..4)", () => {
    for (let rating = 1; rating <= 4; rating++) {
      const result = insertReviewSchema.safeParse(validInsertReview({ rating }));
      expect(result.success, `rating ${rating}`).toBe(true);
    }
  });

  it("accepts all valid states (0..3)", () => {
    for (let state = 0; state <= 3; state++) {
      const result = insertReviewSchema.safeParse(validInsertReview({ state }));
      expect(result.success, `state ${state}`).toBe(true);
    }
  });

  it("accepts difficulty boundaries and zero stability", () => {
    expect(insertReviewSchema.safeParse(validInsertReview({ difficulty: 0.0 })).success).toBe(true);
    expect(insertReviewSchema.safeParse(validInsertReview({ difficulty: 10.0 })).success).toBe(true);
    expect(insertReviewSchema.safeParse(validInsertReview({ stability: 0.0 })).success).toBe(true);
    expect(insertReviewSchema.safeParse(validInsertReview({ stability: 365.0 })).success).toBe(true);
    expect(insertReviewSchema.safeParse(validInsertReview({ time: 5000 })).success).toBe(true);
  });

  it("rejects out-of-bounds review values with field-specific codes", () => {
    const cases: Array<[string, unknown, string]> = [
      ["rating", 0, "validation.reviews.rating"],
      ["rating", 5, "validation.reviews.rating"],
      ["rating", -1, "validation.reviews.rating"],
      ["state", -1, "validation.reviews.state"],
      ["state", 4, "validation.reviews.state"],
      ["stability", -1.0, "validation.reviews.stability"],
      ["difficulty", -0.1, "validation.reviews.difficulty"],
      ["difficulty", 10.1, "validation.reviews.difficulty"],
      ["scheduledDays", -1, "validation.reviews.scheduled-days"],
      ["learningSteps", -1, "validation.reviews.learning-steps"],
      ["time", -1, "validation.reviews.time"],
    ];

    for (const [field, offending, code] of cases) {
      const result = insertReviewSchema.safeParse(validInsertReview({ [field]: offending }));
      expect(firstIssueMessage(result), `${field} = ${offending}`).toBe(code);
    }
  });

  it("accepts boundary review progress values", () => {
    const cases: Array<[string, unknown]> = [
      ["stability", 0.0],
      ["difficulty", 0.0],
      ["difficulty", 10.0],
      ["scheduledDays", 0],
      ["learningSteps", 0],
      ["time", 0],
    ];

    for (const [field, value] of cases) {
      const result = insertReviewSchema.safeParse(validInsertReview({ [field]: value }));
      expect(result.success, `${field} = ${value}`).toBe(true);
    }
  });

  it("rejects null dueAt", () => {
    expect(reviewValidation.safeParse(validReview({ dueAt: null })).success).toBe(false);
    expect(insertReviewSchema.safeParse(validInsertReview({ dueAt: null })).success).toBe(false);
  });

  it("rejects omitted dueAt", () => {
    const { dueAt: _rowDueAt, ...rowWithout } = validReview();
    expect(reviewValidation.safeParse(rowWithout).success).toBe(false);

    const { dueAt: _insertDueAt, ...insertWithout } = validInsertReview();
    expect(insertReviewSchema.safeParse(insertWithout).success).toBe(false);
  });
});
