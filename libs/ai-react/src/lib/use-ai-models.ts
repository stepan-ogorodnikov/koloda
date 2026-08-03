import { aiRuntimeAtom, queryKeys } from "@koloda/core-react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

export function useAIModels(credentialId: string | null) {
  const aiRuntime = useAtomValue(aiRuntimeAtom);
  const query = useQuery({
    queryKey: queryKeys.ai.models(credentialId || ""),
    queryFn: () => aiRuntime.listModels(credentialId!),
    enabled: !!credentialId,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const models = useMemo(() => query.data || [], [query.data]);

  return { ...query, models };
}
