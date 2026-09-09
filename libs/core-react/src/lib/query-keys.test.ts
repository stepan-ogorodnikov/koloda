import { describe, expect, it } from "vitest";
import { queryKeys } from "./query-keys";

describe("queryKeys", () => {
  // WHY: invalidations fire without filters while queries may be created without
  // arguments; all missing-filter shapes must collapse to one cache key or
  // staleTime keeps serving lists invalidations never reach.
  it("normalizes missing lesson filters so invalidations match no-arg queries", () => {
    expect(queryKeys.lessons.all()).toStrictEqual(["lessons", { filters: {} }]);
    expect(queryKeys.lessons.all({})).toStrictEqual(["lessons", { filters: {} }]);
    expect(queryKeys.lessons.all(undefined)).toStrictEqual(["lessons", { filters: {} }]);
    expect(queryKeys.lessons.all({ deckIds: ["01900000-0000-7000-8000-000000000001"] })).toEqual([
      "lessons",
      { filters: { deckIds: ["01900000-0000-7000-8000-000000000001"] } },
    ]);
  });

  // WHY: deck mutations invalidate every per-entity deck list via decksAll();
  // each guard prefix must stay a strict prefix of its per-id deck-list key.
  it("keeps deck-list guard prefixes aligned with their per-id keys", () => {
    expect(queryKeys.algorithms.decksAll()).toEqual(["algorithm_decks"]);
    expect(queryKeys.algorithms.decks("01900000-0000-7000-8000-000000000003")).toEqual([
      "algorithm_decks",
      "01900000-0000-7000-8000-000000000003",
    ]);
    expect(queryKeys.templates.decksAll()).toEqual(["template_decks"]);
    expect(queryKeys.templates.decks("01900000-0000-7000-8000-000000000002")).toEqual([
      "template_decks",
      "01900000-0000-7000-8000-000000000002",
    ]);
  });
});
