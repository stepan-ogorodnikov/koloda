import { describe, expect, it } from "vitest";
import { compareMigrationNames } from "./migrate";

describe("compareMigrationNames", () => {
  it("orders the series by the numeric V prefix, as Refinery does", () => {
    // WHY: lexicographic compare would apply V10 (and V100) before V2,
    // diverging the web applier from desktop Refinery ordering.
    const shuffled = ["V10__add_indexes", "V2__cards", "V1__init", "V11__backfill", "V100__reshape"];
    expect([...shuffled].sort(compareMigrationNames)).toEqual([
      "V1__init",
      "V2__cards",
      "V10__add_indexes",
      "V11__backfill",
      "V100__reshape",
    ]);
  });
});
