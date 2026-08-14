import type { AIModel } from "@koloda/ai";

export type AllowlistMode = "all" | "selected";

export type AllowlistDraft = {
  mode: AllowlistMode;
  selectedIds: string[];
};

export type SettingsModelRow = {
  id: string;
  name: string;
  isStale: boolean;
};

export function createAllowlistDraft(whitelistModelIds?: string[]): AllowlistDraft {
  return {
    mode: whitelistModelIds === undefined ? "all" : "selected",
    selectedIds: whitelistModelIds === undefined ? [] : [...whitelistModelIds],
  };
}

export function setAllowlistMode(draft: AllowlistDraft, mode: AllowlistMode): AllowlistDraft {
  // INVARIANT: Keep selectedIds unchanged while mode is "all" so switching
  // back to "selected" restores them. Do not copy the catalog into selectedIds.
  return { ...draft, mode };
}

export function setAllowlistModelSelected(draft: AllowlistDraft, modelId: string, isSelected: boolean): AllowlistDraft {
  if (draft.mode === "all") return draft;

  const hasId = draft.selectedIds.includes(modelId);
  if (isSelected === hasId) return draft;

  return {
    ...draft,
    selectedIds: isSelected ? [...draft.selectedIds, modelId] : draft.selectedIds.filter((id) => id !== modelId),
  };
}

export function toWhitelistModelIdsUpdate(draft: AllowlistDraft): string[] | null {
  return draft.mode === "all" ? null : draft.selectedIds;
}

export function modelMatchesQuery(name: string, id: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return name.toLowerCase().includes(needle) || id.toLowerCase().includes(needle);
}

export function buildSettingsModelRows(models: AIModel[], draft: AllowlistDraft, query: string): SettingsModelRow[] {
  const catalogIds = new Set(models.map((model) => model.id));
  const rows: SettingsModelRow[] = [];

  for (const model of models) {
    if (!modelMatchesQuery(model.name, model.id, query)) continue;
    rows.push({ id: model.id, name: model.name, isStale: false });
  }

  if (draft.mode === "selected") {
    for (const id of draft.selectedIds) {
      if (catalogIds.has(id)) continue;
      if (!modelMatchesQuery(id, id, query)) continue;
      rows.push({ id, name: id, isStale: true });
    }
  }

  return rows;
}

export function isSettingsModelRowSelected(draft: AllowlistDraft, modelId: string): boolean {
  return draft.mode === "all" || draft.selectedIds.includes(modelId);
}
