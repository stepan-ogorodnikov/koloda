import { queriesAtom, queryKeys } from "@koloda/core-react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

export function useAIModels(credentialId: string | null) {
  const { getAIProfileModelsQuery } = useAtomValue(queriesAtom);
  const query = useQuery({
    queryKey: queryKeys.ai.models(credentialId || ""),
    ...getAIProfileModelsQuery(credentialId || ""),
    enabled: !!credentialId,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const models = useMemo(() => (query.data || []), [query.data]);

  return { ...query, models };
}
