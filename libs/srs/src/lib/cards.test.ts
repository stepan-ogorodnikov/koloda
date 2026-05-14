import { Rating } from "ts-fsrs";
import type { Card as CardFSRS } from "ts-fsrs";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FSRS_ALGORITHM } from "./algorithms-fsrs";
import type { AlgorithmFSRS } from "./algorithms-fsrs";
import type { Algorithm } from "./algorithms";
import {
  createCardFromCardFSRS,
  getCardContentValidation,
  getCardGrades,
  getInsertCardSchema,
  getUpdateCardSchema,
} from "./cards";
import type { Card } from "./cards";
import { DEFAULT_TEMPLATE } from "./templates";
import type { Template, TemplateFields } from "./templates";

const DEFAULT_DATE = new Date("2024-01-01T00:00:00.000Z");

function createCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 1,
    deckId: 1,
    templateId: 1,
    content: { "1": { text: "Question" }, "2": { text: "Answer" } },
    state: 0,
    dueAt: null,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
    createdAt: DEFAULT_DATE,
    updatedAt: null,
    ...overrides,
  };
}

function createAlgorithm(overrides: Partial<Algorithm> = {}): Algorithm {
  return {
    id: 1,
    title: "FSRS",
    content: structuredClone(DEFAULT_FSRS_ALGORITHM),
    createdAt: DEFAULT_DATE,
    updatedAt: null,
    ...overrides,
  };
}

function createTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 1,
    title: "Default",
    content: structuredClone(DEFAULT_TEMPLATE.content),
    isLocked: false,
    createdAt: DEFAULT_DATE,
    updatedAt: null,
    ...overrides,
  };
}

describe("getCardGrades", () => {
  it("returns 4 grades in [Again, Hard, Good, Easy] order", () => {
    vi.useFakeTimers();
    vi.setSystemTime(DEFAULT_DATE);

    const card = createCard();
    const algorithm = createAlgorithm();
    const grades = getCardGrades(card, algorithm);

    expect(grades).toHaveLength(4);
    expect(grades[0].log.rating).toBe(Rating.Again);
    expect(grades[1].log.rating).toBe(Rating.Hard);
    expect(grades[2].log.rating).toBe(Rating.Good);
    expect(grades[3].log.rating).toBe(Rating.Easy);

    vi.useRealTimers();
  });

  it("each grade has card and log properties", () => {
    vi.useFakeTimers();
    vi.setSystemTime(DEFAULT_DATE);

    const card = createCard();
    const algorithm = createAlgorithm();
    const grades = getCardGrades(card, algorithm);

    for (const grade of grades) {
      expect(grade).toHaveProperty("card");
      expect(grade).toHaveProperty("log");
      expect(grade.card).toHaveProperty("due");
      expect(grade.card).toHaveProperty("state");
      expect(grade.log).toHaveProperty("rating");
    }

    vi.useRealTimers();
  });

  it("produces different rating values across grades", () => {
    vi.useFakeTimers();
    vi.setSystemTime(DEFAULT_DATE);

    const card = createCard();
    const algorithm = createAlgorithm();
    const grades = getCardGrades(card, algorithm);

    const ratings = grades.map((g) => g.log.rating);
    const unique = new Set(ratings);
    expect(unique.size).toBeGreaterThanOrEqual(2);
    expect(ratings[0]).toBe(Rating.Again);
    expect(ratings[1]).toBe(Rating.Hard);
    expect(ratings[2]).toBe(Rating.Good);
    expect(ratings[3]).toBe(Rating.Easy);

    vi.useRealTimers();
  });

  it("produces different due dates across grades for a new card", () => {
    vi.useFakeTimers();
    vi.setSystemTime(DEFAULT_DATE);

    const card = createCard();
    const algorithm = createAlgorithm();
    const grades = getCardGrades(card, algorithm);

    const dueDates = grades.map((g) => g.card.due.getTime());
    const uniqueDates = new Set(dueDates);
    // At minimum Again and Good should have different due dates
    expect(uniqueDates.size).toBeGreaterThanOrEqual(2);

    vi.useRealTimers();
  });

  it("works with a previously reviewed card", () => {
    vi.useFakeTimers();
    vi.setSystemTime(DEFAULT_DATE);

    const card = createCard({
      state: 2,
      dueAt: new Date("2024-01-05T00:00:00.000Z"),
      stability: 5,
      difficulty: 3,
      reps: 3,
      lapses: 0,
      lastReviewedAt: new Date("2023-12-30T00:00:00.000Z"),
    });
    const algorithm = createAlgorithm();
    const grades = getCardGrades(card, algorithm);

    expect(grades).toHaveLength(4);
    // Reviewed card should get rescheduled
    expect(grades[Rating.Good].card.due.getTime()).toBeGreaterThan(DEFAULT_DATE.getTime());

    vi.useRealTimers();
  });

  it("works with custom algorithm parameters", () => {
    vi.useFakeTimers();
    vi.setSystemTime(DEFAULT_DATE);

    const customContent: AlgorithmFSRS = {
      ...DEFAULT_FSRS_ALGORITHM,
      retention: 95,
      maximumInterval: 180,
      isFuzzEnabled: false,
    };
    const algorithm = createAlgorithm({ content: customContent });
    const card = createCard();
    const grades = getCardGrades(card, algorithm);

    expect(grades).toHaveLength(4);

    vi.useRealTimers();
  });
});

describe("createCardFromCardFSRS", () => {
  it("maps fsrs card properties to app card properties", () => {
    vi.useFakeTimers();
    vi.setSystemTime(DEFAULT_DATE);

    const fsrsCard: CardFSRS = {
      due: new Date("2024-01-03T00:00:00.000Z"),
      stability: 2.5,
      difficulty: 4.2,
      elapsed_days: 2,
      scheduled_days: 7,
      reps: 1,
      lapses: 0,
      state: 1,
      last_review: new Date("2024-01-01T00:00:00.000Z"),
      learning_steps: 2,
    } as CardFSRS;

    const result = createCardFromCardFSRS(fsrsCard);

    expect(result.dueAt).toEqual(new Date("2024-01-03T00:00:00.000Z"));
    expect(result.lastReviewedAt).toEqual(new Date("2024-01-01T00:00:00.000Z"));
    expect(result.learningSteps).toBe(2);
    expect(result.scheduledDays).toBe(7);
    expect(result.stability).toBe(2.5);
    expect(result.difficulty).toBe(4.2);
    expect(result.state).toBe(1);
    expect(result.reps).toBe(1);

    vi.useRealTimers();
  });

  it("preserves properties that exist on both CardFSRS and Card but are not explicitly mapped", () => {
    const fsrsCard: CardFSRS = {
      due: new Date(),
      stability: 3,
      difficulty: 1,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null as unknown as Date,
      learning_steps: 0,
    } as CardFSRS;

    const result = createCardFromCardFSRS(fsrsCard);

    expect(result.stability).toBe(3);
    expect(result.difficulty).toBe(1);
    expect(result.reps).toBe(0);
    expect(result.lapses).toBe(0);
    expect(result.state).toBe(0);
  });
});

describe("getCardContentValidation", () => {
  const fields: TemplateFields = [
    { id: 1, title: "Front", type: "text", isRequired: true },
    { id: 2, title: "Back", type: "markdown", isRequired: false },
  ];

  it("requires text on required fields", () => {
    const { content: contentSchema } = getCardContentValidation(fields);
    const result = contentSchema.safeParse({ "1": { text: "" }, "2": { text: "anything" } });
    expect(result.success).toBe(false);
  });

  it("accepts non-empty text on required fields", () => {
    const { content: contentSchema } = getCardContentValidation(fields);
    const result = contentSchema.safeParse({ "1": { text: "Valid" }, "2": { text: "Back" } });
    expect(result.success).toBe(true);
  });

  it("accepts empty text on non-required fields", () => {
    const { content: contentSchema } = getCardContentValidation(fields);
    const result = contentSchema.safeParse({ "1": { text: "Valid" }, "2": { text: "" } });
    expect(result.success).toBe(true);
  });
});

describe("getInsertCardSchema", () => {
  it("produces a schema that validates cards against template fields", () => {
    const template = createTemplate();
    const schema = getInsertCardSchema(template);

    const valid = schema.safeParse({
      deckId: 1,
      templateId: template.id,
      content: {
        "1": { text: "Front text" },
        "2": { text: "Back text" },
      },
    });
    expect(valid.success).toBe(true);
  });

  it("rejects missing required field content", () => {
    const template = createTemplate();
    const schema = getInsertCardSchema(template);

    const result = schema.safeParse({
      deckId: 1,
      templateId: template.id,
      content: {
        "1": { text: "" },
        "2": { text: "Back text" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing content keys entirely", () => {
    const template = createTemplate();
    const schema = getInsertCardSchema(template);

    const result = schema.safeParse({
      deckId: 1,
      templateId: template.id,
      content: {
        "1": { text: "Only front" },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("getUpdateCardSchema", () => {
  it("validates card content against template fields", () => {
    const template = createTemplate();
    const schema = getUpdateCardSchema(template);

    const valid = schema.safeParse({
      content: {
        "1": { text: "Updated front" },
        "2": { text: "Updated back" },
      },
    });
    expect(valid.success).toBe(true);
  });

  it("rejects empty required fields in content", () => {
    const template = createTemplate();
    const schema = getUpdateCardSchema(template);

    const result = schema.safeParse({
      content: {
        "1": { text: "" },
        "2": { text: "Updated back" },
      },
    });
    expect(result.success).toBe(false);
  });
});
