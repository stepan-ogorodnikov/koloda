import { describe, expect, it } from "vitest";
import { queryKeys } from "./query-keys";

describe("queryKeys", () => {
  it("builds stable AI keys", () => {
    expect(queryKeys.ai.profiles()).toEqual(["ai", "profiles"]);
    expect(queryKeys.ai.models("cred-1")).toEqual(["ai", "models", "cred-1"]);
  });

  it("builds stable algorithm keys", () => {
    expect(queryKeys.algorithms.all()).toEqual(["algorithms"]);
    expect(queryKeys.algorithms.detail(3)).toEqual(["algorithms", "3"]);
    expect(queryKeys.algorithms.decks(3)).toEqual(["algorithm_decks", "3"]);
  });

  it("builds stable card and deck keys", () => {
    expect(queryKeys.cards.deck({ deckId: 9 })).toEqual(["cards", "9"]);
    expect(queryKeys.cards.detail(9)).toEqual(["cards", "9"]);
    expect(queryKeys.decks.all()).toEqual(["decks"]);
    expect(queryKeys.decks.detail(9)).toEqual(["decks", "9"]);
  });

  it("builds stable conversation, lesson, review, settings, and template keys", () => {
    expect(queryKeys.conversations.all()).toEqual(["conversations"]);
    expect(queryKeys.conversations.detail("c1")).toEqual(["conversations", "c1"]);
    expect(queryKeys.lessons.all({ deckIds: [1] })).toEqual(["lessons", { filters: { deckIds: [1] } }]);
    expect(queryKeys.lessons.todayReviewTotals()).toEqual(["today_review_totals"]);
    expect(queryKeys.reviews.card({ cardId: 4 })).toEqual(["reviews", "4"]);
    expect(queryKeys.settings.all()).toEqual(["settings"]);
    expect(queryKeys.settings.detail("hotkeys")).toEqual(["settings", "hotkeys"]);
    expect(queryKeys.templates.all()).toEqual(["templates"]);
    expect(queryKeys.templates.detail(2)).toEqual(["templates", "2"]);
    expect(queryKeys.templates.decks(2)).toEqual(["template_decks", "2"]);
  });
});
