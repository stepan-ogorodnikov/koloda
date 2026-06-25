import { useAIProfiles } from "@koloda/ai-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { aiProfileStateAtom, reconcileAIProfileState } from "./ai-profile-state";
import type { AIProfileState, AIProfileStateUpdater } from "./ai-profile-state";

export type UseGlobalAIProfileStateReturn = [
  AIProfileState,
  (updater: AIProfileStateUpdater) => void,
];

export function useGlobalAIProfileState(): UseGlobalAIProfileStateReturn {
  const stored = useAtomValue(aiProfileStateAtom);
  const setStored = useSetAtom(aiProfileStateAtom);
  const { profiles } = useAIProfiles();

  const state = useMemo(
    () => reconcileAIProfileState(stored, profiles),
    [stored, profiles],
  );

  const setState = useCallback(
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

  return [state, setState];
}
