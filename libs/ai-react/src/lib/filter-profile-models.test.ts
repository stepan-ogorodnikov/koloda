import { describe, expect, it } from "vitest";
import { filterProfileModelsForPicker } from "./filter-profile-models";
import type { AIModel } from "@koloda/ai";

const gpt: AIModel = { id: "openai/gpt-4", name: "GPT-4", context_length: 128000 };
const claude: AIModel = { id: "anthropic/claude", name: "Claude", context_length: 200000 };
const gemini: AIModel = { id: "google/gemini", name: "Gemini", context_length: 100000 };
const catalog = [gpt, claude, gemini];

describe("filterProfileModelsForPicker", () => {
  it("shows every catalog model when the allowlist is unset", () => {
    expect(filterProfileModelsForPicker({ models: catalog })).toEqual(catalog);
  });

  it("filters the catalog to allowlisted ids", () => {
    expect(
      filterProfileModelsForPicker({
        models: catalog,
        whitelistModelIds: ["anthropic/claude", "google/gemini"],
      }),
    ).toEqual([claude, gemini]);
  });

  it("returns an empty list for an empty allowlist", () => {
    expect(filterProfileModelsForPicker({ models: catalog, whitelistModelIds: [] })).toEqual([]);
  });

  it("hides stale allowlist ids that are gone from the catalog", () => {
    expect(
      filterProfileModelsForPicker({
        models: catalog,
        whitelistModelIds: ["openai/gpt-4", "gone/model"],
      }),
    ).toEqual([gpt]);
  });

  it("keeps the selected model visible when it is not in the allowlist", () => {
    expect(
      filterProfileModelsForPicker({
        models: catalog,
        whitelistModelIds: ["openai/gpt-4"],
        selectedModelId: "google/gemini",
      }),
    ).toEqual([gpt, gemini]);
  });

  it("keeps the selected model visible for an empty allowlist", () => {
    expect(
      filterProfileModelsForPicker({
        models: catalog,
        whitelistModelIds: [],
        selectedModelId: "openai/gpt-4",
      }),
    ).toEqual([gpt]);
  });

  it("keeps a selected model that is missing from the catalog", () => {
    expect(
      filterProfileModelsForPicker({
        models: catalog,
        whitelistModelIds: ["openai/gpt-4"],
        selectedModelId: "gone/model",
      }),
    ).toEqual([gpt, { id: "gone/model", name: "gone/model", context_length: 0 }]);
  });

  it("keeps a selected model missing from the catalog when the allowlist is unset", () => {
    expect(
      filterProfileModelsForPicker({
        models: catalog,
        selectedModelId: "gone/model",
      }),
    ).toEqual([...catalog, { id: "gone/model", name: "gone/model", context_length: 0 }]);
  });
});
