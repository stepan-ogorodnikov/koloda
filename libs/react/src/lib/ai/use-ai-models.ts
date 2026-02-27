import { aiQueryKeys, queriesAtom } from "@koloda/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

export function useAIModels(credentialId: string | null) {
  const { getAIProfileModelsQuery } = useAtomValue(queriesAtom);
  const query = useQuery({
    queryKey: aiQueryKeys.models(credentialId || ""),
    ...getAIProfileModelsQuery(credentialId || ""),
    enabled: !!credentialId,
  });
  const models = useMemo(() => (query.data || []), [query.data]);

  return { ...query, models };
}
