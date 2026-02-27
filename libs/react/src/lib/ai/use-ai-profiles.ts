import { aiQueryKeys, queriesAtom } from "@koloda/react";
import type { AIProfile, AISecrets } from "@koloda/srs";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

function getApiKey(secrets: AISecrets): string | null {
  switch (secrets.provider) {
    case "openrouter":
      return secrets.apiKey;
    case "ollama":
      return null;
    case "lmstudio":
      return secrets.apiKey ?? null;
    default:
      return null;
  }
}

export function useAIProfiles(profileId?: string | null) {
  const queries = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: aiQueryKeys.profiles(), ...queries.getAIProfilesQuery() });
  const profiles = useMemo(() => (query.data ?? []), [query.data]);

  const defaultProfileId = useMemo(() => {
    if (profiles.length === 0) return null;

    const sorted = [...profiles].sort((a, b) => {
      if (a.lastUsedAt && b.lastUsedAt) return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();
      if (a.lastUsedAt) return -1;
      if (b.lastUsedAt) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return sorted[0].id;
  }, [profiles]);

  const selectedProfile = useMemo(() => {
    if (!profileId) return null;
    return profiles.find((p: AIProfile) => p.id === profileId) ?? null;
  }, [profiles, profileId]);

  const lastUsedModel = selectedProfile?.lastUsedModel ?? null;

  return {
    ...query,
    profiles,
    defaultProfileId,
    selectedProfile,
    lastUsedModel,
    secrets: selectedProfile?.secrets ?? null,
    apiKey: selectedProfile?.secrets ? getApiKey(selectedProfile.secrets) : null,
  };
}
