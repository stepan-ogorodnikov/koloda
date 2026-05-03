import type { AIProfile, AISecrets } from "@koloda/ai";
import { getProviderConfig } from "@koloda/ai";
import type { SecretField } from "@koloda/ai";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

const SECRETS_LABELS: Record<SecretField, MessageDescriptor> = {
  apiKey: msg`settings.ai.profiles.api-key.label`,
  baseUrl: msg`settings.ai.profiles.base-url.label`,
};

function getMissingSecretFields(secrets: AISecrets | null | undefined): SecretField[] {
  if (!secrets) return [];
  const entry = getProviderConfig(secrets.provider);
  return entry.getMissingSecretFields(secrets);
}

function getApiKey(secrets: AISecrets): string | null {
  const entry = getProviderConfig(secrets.provider);
  return entry.getApiKey(secrets);
}

export function useAIProfiles(profileId?: string | null) {
  const { _ } = useLingui();
  const { getAIProfilesQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: queryKeys.ai.profiles(), ...getAIProfilesQuery() });
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

  const missingSecretFields = getMissingSecretFields(selectedProfile?.secrets);
  const missingSecretFieldLabels = useMemo(() => (
    missingSecretFields.map((field) => _(SECRETS_LABELS[field]))
  ), [missingSecretFields, _]);

  return {
    ...query,
    profiles,
    defaultProfileId,
    selectedProfile,
    lastUsedModel,
    secrets: selectedProfile?.secrets ?? null,
    apiKey: selectedProfile?.secrets ? getApiKey(selectedProfile.secrets) : null,
    missingSecretFieldLabels,
  };
}
