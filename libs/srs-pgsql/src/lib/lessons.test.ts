import type { AppError } from "@koloda/app";
import { describe, expect, it } from "vitest";
import type { DB } from "./db";
import { submitLessonResult } from "./lessons";

describe("lessons", () => {
  it("rejects a lesson result whose card id does not match the review cardId", async () => {
    // Mirrors the Rust test_lesson_result_card_review_id_mismatch_fails rule:
    // both entities are individually valid; only their id link is broken.
    const card = {
      id: 7,
      deckId: 1,
      templateId: 1,
      content: { front: { text: "front" }, back: { text: "back" } },
      state: 2,
      dueAt: new Date("2026-01-12T12:00:00.000Z"),
      stability: 4.5,
      difficulty: 2.25,
      scheduledDays: 2,
      learningSteps: 0,
      reps: 1,
      lapses: 0,
      lastReviewedAt: new Date("2026-01-10T12:00:00.000Z"),
      createdAt: new Date("2026-01-01T12:00:00.000Z"),
      updatedAt: null,
    };
    const review = {
      cardId: 8,
      rating: 3,
      state: 2,
      dueAt: new Date("2026-01-12T12:00:00.000Z"),
      stability: 4.5,
      difficulty: 2.25,
      scheduledDays: 2,
      learningSteps: 0,
      time: 1250,
      isIgnored: false,
      createdAt: new Date("2026-01-10T12:00:00.000Z"),
    };

    // The mismatch guard fires before any DB access, so no database is needed.
    await expect(submitLessonResult({} as DB, { card, review })).rejects.toMatchObject({
      code: "validation.lessons.result.card-review-mismatch",
    } satisfies Partial<AppError>);
  });
});
