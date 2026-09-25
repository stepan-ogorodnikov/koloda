import { SEED_TEMPLATE_TYPE_BACK_FIELD_ID, SEED_TEMPLATE_TYPE_FRONT_FIELD_ID } from "@koloda/app";
import { Rating } from "ts-fsrs";
import type { Card as CardFSRS } from "ts-fsrs";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FSRS_ALGORITHM } from "./algorithms-fsrs";
import type { Algorithm } from "./algorithms";
import {
  createCardFromCardFSRS,
  createUpdateCardProgress,
  getCardContentValidation,
  getCardGrades,
  getInsertCardSchema,
  getUpdateCardSchema,
} from "./cards";
import type { Card } from "./cards";
import { DEFAULT_TEMPLATE } from "./templates";
import type { Template, TemplateFields } from "./templates";

const DEFAULT_DATE = new Date("2024-01-01T00:00:00.000Z");

const ID = "01900000-0000-7000-8000-000000000001";

function createCard(overrides: Partial<Card> = {}): Card {
  return {
    id: ID,
    deckId: ID,
    templateId: ID,
    content: {
      [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: "Question" },
      [SEED_TEMPLATE_TYPE_BACK_FIELD_ID]: { text: "Answer" },
    },
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
    id: ID,
    title: "FSRS",
    content: structuredClone(DEFAULT_FSRS_ALGORITHM),
    createdAt: DEFAULT_DATE,
    updatedAt: null,
    ...overrides,
  };
}

function createTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: ID,
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
});

describe("createUpdateCardProgress", () => {
  const CARD_ID = "01900000-0000-7000-8000-000000000009";
  const DUE = new Date("2024-01-03T00:00:00.000Z");

  // INVARIANT: Twin of koloda `cards_progress_tests.rs` UpdateCardProgress shape pins — the submit
  // payload must carry exactly the fields the Rust struct deserializes, nothing more.
  it("maps the graded FSRS card to exactly the submit progress fields", () => {
    const lastReview = new Date("2024-01-01T00:00:00.000Z");
    const result = createUpdateCardProgress(CARD_ID, {
      due: DUE,
      stability: 2.5,
      difficulty: 4.2,
      elapsed_days: 2,
      scheduled_days: 7,
      reps: 1,
      lapses: 0,
      state: 1,
      last_review: lastReview,
      learning_steps: 2,
    } as CardFSRS);

    expect(result).toEqual({
      id: CARD_ID,
      state: 1,
      dueAt: DUE,
      stability: 2.5,
      difficulty: 4.2,
      scheduledDays: 7,
      learningSteps: 2,
      reps: 1,
      lapses: 0,
      lastReviewedAt: lastReview,
    });
  });

  it("maps a missing last_review to null", () => {
    const result = createUpdateCardProgress(CARD_ID, {
      due: DUE,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      learning_steps: 0,
    } as CardFSRS);

    expect(result.lastReviewedAt).toBeNull();
  });
});

describe("getCardContentValidation", () => {
  const fields: TemplateFields = [
    { id: SEED_TEMPLATE_TYPE_FRONT_FIELD_ID, title: "Front", type: "text", isRequired: true },
    { id: SEED_TEMPLATE_TYPE_BACK_FIELD_ID, title: "Back", type: "markdown", isRequired: false },
  ];

  // Missing optional field keys: twin of koloda `test_insert_card_content_optional_field_missing_fails`.
  // CARDS.md §Card Content requires every template field to be present.
  it.each([
    {
      scenario: "empty text on a required field",
      content: {
        [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: "" },
        [SEED_TEMPLATE_TYPE_BACK_FIELD_ID]: { text: "anything" },
      },
      success: false,
    },
    {
      scenario: "non-empty text on required fields",
      content: {
        [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: "Valid" },
        [SEED_TEMPLATE_TYPE_BACK_FIELD_ID]: { text: "Back" },
      },
      success: true,
    },
    {
      scenario: "empty text on a non-required field",
      content: {
        [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: "Valid" },
        [SEED_TEMPLATE_TYPE_BACK_FIELD_ID]: { text: "" },
      },
      success: true,
    },
    {
      scenario: "a missing optional field key",
      content: {
        [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: "Valid" },
      },
      success: false,
    },
  ])("$scenario", ({ content, success }) => {
    const { content: contentSchema } = getCardContentValidation(fields);
    expect(contentSchema.safeParse(content).success).toBe(success);
  });
});

describe("getInsertCardSchema", () => {
  it("produces a schema that validates cards against template fields", () => {
    const template = createTemplate();
    const schema = getInsertCardSchema(template);

    const valid = schema.safeParse({
      deckId: ID,
      templateId: template.id,
      content: {
        [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: "Front text" },
        [SEED_TEMPLATE_TYPE_BACK_FIELD_ID]: { text: "Back text" },
      },
    });
    expect(valid.success).toBe(true);
  });

  it("rejects missing required field content", () => {
    const template = createTemplate();
    const schema = getInsertCardSchema(template);

    const result = schema.safeParse({
      deckId: ID,
      templateId: template.id,
      content: {
        [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: "" },
        [SEED_TEMPLATE_TYPE_BACK_FIELD_ID]: { text: "Back text" },
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
        [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: "Updated front" },
        [SEED_TEMPLATE_TYPE_BACK_FIELD_ID]: { text: "Updated back" },
      },
    });
    expect(valid.success).toBe(true);
  });

  it("rejects empty required fields in content", () => {
    const template = createTemplate();
    const schema = getUpdateCardSchema(template);

    const result = schema.safeParse({
      content: {
        [SEED_TEMPLATE_TYPE_FRONT_FIELD_ID]: { text: "" },
        [SEED_TEMPLATE_TYPE_BACK_FIELD_ID]: { text: "Updated back" },
      },
    });
    expect(result.success).toBe(false);
  });
});
