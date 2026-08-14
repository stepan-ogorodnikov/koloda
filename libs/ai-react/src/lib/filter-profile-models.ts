import type { AIModel } from "@koloda/ai";

export type FilterProfileModelsForPickerArgs = {
  models: AIModel[];
  whitelistModelIds?: string[];
  selectedModelId?: string | null;
};

function placeholderModel(id: string): AIModel {
  return { id, name: id, context_length: 0 };
}

// WHY: Unset allowlist = every catalog model. A present array is the allowlist
// (`[]` means none). Stale allowlist ids are hidden in the picker; the current
// selection stays visible so a catalog change cannot strand it.
export function filterProfileModelsForPicker({
  models,
  whitelistModelIds,
  selectedModelId,
}: FilterProfileModelsForPickerArgs): AIModel[] {
  const allowlist = whitelistModelIds === undefined ? null : new Set(whitelistModelIds);
  const result: AIModel[] = [];

  for (const model of models) {
    if (allowlist === null || allowlist.has(model.id) || model.id === selectedModelId) result.push(model);
  }

  if (selectedModelId && !result.some((model) => model.id === selectedModelId)) {
    result.push(placeholderModel(selectedModelId));
  }

  return result;
}
