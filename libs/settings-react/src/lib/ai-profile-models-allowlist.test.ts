import { describe, expect, it } from "vitest";
import {
  buildSettingsModelRows,
  createAllowlistDraft,
  isSettingsModelRowSelected,
  setAllowlistMode,
  setAllowlistModelSelected,
  toWhitelistModelIdsUpdate,
} from "./ai-profile-models-allowlist";
import type { AIModel } from "@koloda/ai";

const gpt: AIModel = { id: "openai/gpt-4", name: "GPT-4", context_length: 128000 };
const claude: AIModel = { id: "anthropic/claude", name: "Claude", context_length: 200000 };
const catalog = [gpt, claude];

describe("createAllowlistDraft", () => {
  it("uses All when the allowlist is unset", () => {
    expect(createAllowlistDraft(undefined)).toEqual({ mode: "all", selectedIds: [] });
  });

  it("uses Selected for an empty allowlist", () => {
    expect(createAllowlistDraft([])).toEqual({ mode: "selected", selectedIds: [] });
  });

  it("uses Selected and copies stored ids", () => {
    expect(createAllowlistDraft(["openai/gpt-4"])).toEqual({ mode: "selected", selectedIds: ["openai/gpt-4"] });
  });
});

describe("setAllowlistMode", () => {
  it("restores the previous allowlist when switching from All to Selected", () => {
    const stored = createAllowlistDraft(["openai/gpt-4"]);
    const withAll = setAllowlistMode(stored, "all");
    expect(withAll.mode).toBe("all");
    expect(withAll.selectedIds).toEqual(["openai/gpt-4"]);
    expect(setAllowlistMode(withAll, "selected").selectedIds).toEqual(["openai/gpt-4"]);
  });

  it("leaves nothing checked when switching to Selected with no previous allowlist", () => {
    const draft = setAllowlistMode(createAllowlistDraft(undefined), "selected");
    expect(draft).toEqual({ mode: "selected", selectedIds: [] });
  });

  it("does not snapshot the catalog when switching to Selected", () => {
    const draft = setAllowlistMode(createAllowlistDraft(undefined), "selected");
    expect(draft.selectedIds).toEqual([]);
    expect(toWhitelistModelIdsUpdate(draft)).toEqual([]);
  });
});

describe("setAllowlistModelSelected", () => {
  it("ignores checkbox changes while All is selected", () => {
    const draft = createAllowlistDraft(undefined);
    expect(setAllowlistModelSelected(draft, "openai/gpt-4", false)).toEqual(draft);
    expect(setAllowlistModelSelected(draft, "openai/gpt-4", true)).toEqual(draft);
  });

  it("toggles ids while Selected is active", () => {
    const empty = createAllowlistDraft([]);
    const withGpt = setAllowlistModelSelected(empty, "openai/gpt-4", true);
    expect(withGpt.selectedIds).toEqual(["openai/gpt-4"]);
    expect(setAllowlistModelSelected(withGpt, "openai/gpt-4", false).selectedIds).toEqual([]);
  });
});

describe("toWhitelistModelIdsUpdate", () => {
  it("writes null when All is selected", () => {
    expect(toWhitelistModelIdsUpdate(createAllowlistDraft(undefined))).toBeNull();
    expect(toWhitelistModelIdsUpdate(setAllowlistMode(createAllowlistDraft(["openai/gpt-4"]), "all"))).toBeNull();
  });

  it("writes the selected ids when Selected is active, including an empty allowlist", () => {
    expect(toWhitelistModelIdsUpdate(createAllowlistDraft([]))).toEqual([]);
    expect(toWhitelistModelIdsUpdate(createAllowlistDraft(["openai/gpt-4"]))).toEqual(["openai/gpt-4"]);
  });
});

describe("buildSettingsModelRows", () => {
  it("lists catalog models and keeps stale allowlist ids checked", () => {
    const draft = createAllowlistDraft(["openai/gpt-4", "gone/model"]);
    expect(buildSettingsModelRows(catalog, draft, "")).toEqual([
      { id: "openai/gpt-4", name: "GPT-4", isStale: false },
      { id: "anthropic/claude", name: "Claude", isStale: false },
      { id: "gone/model", name: "gone/model", isStale: true },
    ]);
    expect(isSettingsModelRowSelected(draft, "openai/gpt-4")).toBe(true);
    expect(isSettingsModelRowSelected(draft, "gone/model")).toBe(true);
    expect(isSettingsModelRowSelected(draft, "anthropic/claude")).toBe(false);
  });

  it("does not list stale ids while All is selected", () => {
    const draft = setAllowlistMode(createAllowlistDraft(["gone/model"]), "all");
    expect(buildSettingsModelRows(catalog, draft, "")).toEqual([
      { id: "openai/gpt-4", name: "GPT-4", isStale: false },
      { id: "anthropic/claude", name: "Claude", isStale: false },
    ]);
    expect(isSettingsModelRowSelected(draft, "openai/gpt-4")).toBe(true);
  });

  it("filters catalog and stale rows by name or id", () => {
    const draft = createAllowlistDraft(["gone/model"]);
    expect(buildSettingsModelRows(catalog, draft, "claude")).toEqual([
      { id: "anthropic/claude", name: "Claude", isStale: false },
    ]);
    expect(buildSettingsModelRows(catalog, draft, "gone")).toEqual([
      { id: "gone/model", name: "gone/model", isStale: true },
    ]);
  });
});
