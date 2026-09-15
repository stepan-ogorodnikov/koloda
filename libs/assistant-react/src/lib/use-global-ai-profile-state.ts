import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { aiProfileStateAtom } from "./state/ai-profile-state";
import type { AIProfileStateUpdater } from "./state/ai-profile-state";
import { lastUsedOnRunStart } from "./state/ai-profile-sync";

export function useSetGlobalAIProfileState(): (updater: AIProfileStateUpdater) => void {
  const stored = useAtomValue(aiProfileStateAtom);
  const setStored = useSetAtom(aiProfileStateAtom);

  return useCallback(
    (updater: AIProfileStateUpdater) => {
      const nextModelParameters: Record<string, string> = { ...stored?.modelParameters };
      if (updater.modelParameters) {
        for (const [key, value] of Object.entries(updater.modelParameters)) {
          if (value === null || value === "") {
            delete nextModelParameters[key];
          } else {
            nextModelParameters[key] = value;
          }
        }
      }

      setStored({
        profileId: updater.profileId,
        modelId: updater.modelId,
        modelParameters: nextModelParameters,
      });
    },
    [setStored, stored],
  );
}

/**
 * Submit/retry path: persist last-used profile/model without touching params.
 */
export function useRememberLastUsedAIProfile(): (profileId: string, modelId: string) => void {
  const setGlobal = useSetGlobalAIProfileState();
  return useCallback(
    (profileId: string, modelId: string) => {
      setGlobal(lastUsedOnRunStart(profileId, modelId));
    },
    [setGlobal],
  );
}
