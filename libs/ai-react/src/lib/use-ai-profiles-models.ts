import type { AIModel } from "@koloda/ai";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { useQueries } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

export type AIProfileModelsState = {
  profileId: string;
  models: AIModel[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
};

export function useAIProfilesModels(profileIds: string[]): {
  byProfileId: Record<string, AIProfileModelsState>;
  states: AIProfileModelsState[];
} {
  const { getAIProfileModelsQuery } = useAtomValue(queriesAtom);
  const idsKey = profileIds.join("\0");
  const stableIds = useMemo(() => (idsKey ? idsKey.split("\0") : []), [idsKey]);

  const queries = useQueries({
    queries: stableIds.map((profileId) => ({
      queryKey: queryKeys.ai.models(profileId),
      ...getAIProfileModelsQuery(profileId),
      enabled: !!profileId,
      retry: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    })),
  });

  const states = useMemo(
    (): AIProfileModelsState[] =>
      stableIds.map((profileId, index) => {
        const query = queries[index];
        return {
          profileId,
          models: query?.data ?? [],
          isLoading: query?.isLoading ?? false,
          isError: query?.isError ?? false,
          error: (query?.error as Error | null) ?? null,
          refetch: () => {
            void query?.refetch();
          },
        };
      }),
    [stableIds, queries],
  );

  const byProfileId = useMemo(() => Object.fromEntries(states.map((state) => [state.profileId, state])), [states]);

  return { byProfileId, states };
}
