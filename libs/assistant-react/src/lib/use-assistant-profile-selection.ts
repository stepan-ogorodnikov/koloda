import type { ModelParameter } from "@koloda/ai";
import type { AIModel, AISecrets } from "@koloda/ai";
import { useAIProfiles, useAIProfilesModels } from "@koloda/ai-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { modelChangeSync, parameterChangeSync, profileChangeSync } from "./state/ai-profile-sync";
import { aiProfileStateAtom, reconcileAIProfileState } from "./state/ai-profile-state";
import {
  setAssistantAIModelAtom,
  setAssistantAIModelParameterAtom,
  setAssistantAIProfileAtom,
} from "./state/conversation-actions";
import {
  assistantAIModelIdAtom,
  assistantAIModelParametersAtom,
  assistantProfileIdAtom,
} from "./state/conversation-selectors";
import { currentConversationIdAtom } from "./state/conversation-store";
import { useSetGlobalAIProfileState } from "./use-global-ai-profile-state";

export type UseAssistantProfileSelectionReturn = {
  profileId: string;
  modelId: string;
  modelName: string | undefined;
  models: AIModel[];
  isModelsLoading: boolean;
  isModelsError: boolean;
  areProfilesLoading: boolean;
  selectedProfile: ReturnType<typeof useAIProfiles>["selectedProfile"];
  profiles: ReturnType<typeof useAIProfiles>["profiles"];
  defaultProfileId: string | null;
  missingSecretFieldLabels: string[];
  provider: AISecrets["provider"] | null;
  modelParameters: ModelParameter[];
  hasProfiles: boolean;
  handleModelProfileChange: (next: { profileId: string; modelId: string }) => void;
  handleModelParameterChange: (type: ModelParameter["type"], value: string) => void;
};

type HandleModelProfileChangeParams = { profileId: string; modelId: string };

const emptyModelParameters: Partial<Record<ModelParameter["type"], string>> = {};
const noModels: AIModel[] = [];

/**
 * Chat-tree owner of per-conversation AI selection + dual-write to global last-used.
 * Sole `useAIProfiles` subscriber in the chat tree (pass `profiles` into the picker).
 */
export function useAssistantProfileSelection(): UseAssistantProfileSelectionReturn {
  const conversationId = useAtomValue(currentConversationIdAtom);
  const conversationProfileId = useAtomValue(assistantProfileIdAtom);
  const conversationModelId = useAtomValue(assistantAIModelIdAtom);
  const conversationModelParameters = useAtomValue(assistantAIModelParametersAtom);
  const globalAIProfileState = useAtomValue(aiProfileStateAtom);

  const hasConversation = conversationId != null;
  const storedProfileId = hasConversation ? conversationProfileId : (globalAIProfileState?.profileId ?? null);
  const storedModelId = hasConversation ? conversationModelId : (globalAIProfileState?.modelId ?? null);
  const storedModelParameters = hasConversation
    ? conversationModelParameters
    : (globalAIProfileState?.modelParameters ?? emptyModelParameters);

  const setAIProfile = useSetAtom(setAssistantAIProfileAtom);
  const setAIModel = useSetAtom(setAssistantAIModelAtom);
  const setAIModelParameter = useSetAtom(setAssistantAIModelParameterAtom);

  const setGlobalAIProfileState = useSetGlobalAIProfileState();
  const replaceGlobalAIProfileState = useSetAtom(aiProfileStateAtom);

  const {
    profiles,
    isLoading: areProfilesLoading,
    isSuccess: areProfilesLoaded,
    selectedProfile,
    defaultProfileId,
    missingSecretFieldLabels,
  } = useAIProfiles(storedProfileId);
  const { byProfileId } = useAIProfilesModels(storedProfileId ? [storedProfileId] : []);
  const modelsState = storedProfileId ? byProfileId[storedProfileId] : undefined;
  const models = modelsState?.models ?? noModels;
  const isModelsLoading = modelsState?.isLoading ?? false;
  const isModelsError = modelsState?.isError ?? false;
  const provider = selectedProfile?.secrets?.provider ?? null;
  const hasProfiles = profiles.length > 0;

  useEffect(() => {
    if (hasConversation) {
      if (defaultProfileId && !storedProfileId) {
        setAIProfile({ profileId: defaultProfileId, modelId: null, modelParameters: {} });
      }
      return;
    }
    // WHY: The profile list is empty while it loads or after it failed;
    // reconciling against it would wipe a valid stored profile.
    if (!areProfilesLoaded) return;
    // INVARIANT: A missing or unavailable stored profile falls back to the
    // newest profile, no model, and empty parameters (ASSISTANT-CONVERSATIONS.md
    // §Global AI Profile State). Write only when the profile changes, so an
    // empty profile list does not rewrite the record again.
    const reconciled = reconcileAIProfileState(globalAIProfileState, profiles);
    if (!globalAIProfileState || globalAIProfileState.profileId !== reconciled.profileId) {
      replaceGlobalAIProfileState(reconciled);
    }
  }, [
    hasConversation,
    defaultProfileId,
    storedProfileId,
    setAIProfile,
    areProfilesLoaded,
    globalAIProfileState,
    profiles,
    replaceGlobalAIProfileState,
  ]);

  const allowlist = selectedProfile?.whitelistModelIds;
  const resolvedModelId = useMemo(() => {
    if (!storedProfileId) return "";
    // INVARIANT: a stored model stays while the catalog has it, even when the
    // allowlist later drops it (AI-PROVIDERS.md §Allowlist); only the fallback
    // honors the allowlist, and an empty one resolves to no model.
    if (storedModelId && models.some((m) => m.id === storedModelId)) return storedModelId;
    return models.find((m) => allowlist === undefined || allowlist.includes(m.id))?.id ?? "";
  }, [storedProfileId, storedModelId, models, allowlist]);

  const modelName = models.find((m) => m.id === resolvedModelId)?.name;

  const modelParameters = useMemo((): ModelParameter[] => {
    const model = models.find((m) => m.id === resolvedModelId);
    const params: ModelParameter[] = [];

    const levels = model?.supported_reasoning_levels;
    if (levels && levels.length > 0) {
      const stored = storedModelParameters.reasoning_effort;
      const value = stored && levels.some((l) => l.effort === stored) ? stored : (model?.default_reasoning_level ?? "");
      params.push({ type: "reasoning_effort", value, levels, hasDefault: model?.default_reasoning_level != null });
    }

    return params;
  }, [resolvedModelId, models, storedModelParameters]);

  const handleModelProfileChange = useCallback(
    (params: HandleModelProfileChangeParams) => {
      const { profileId: nextProfileId, modelId: nextModelId } = params;
      if (nextProfileId !== storedProfileId) {
        const sync = profileChangeSync(nextProfileId, nextModelId);
        setAIProfile(sync.conversation);
        replaceGlobalAIProfileState(sync.global);
        return;
      }
      const sync = modelChangeSync(storedProfileId, nextModelId);
      setAIModel(sync.conversation);
      replaceGlobalAIProfileState(sync.global);
    },
    [setAIProfile, setAIModel, replaceGlobalAIProfileState, storedProfileId],
  );

  const handleModelParameterChange = useCallback(
    (type: ModelParameter["type"], value: string) => {
      const nextValue = value || null;
      const sync = parameterChangeSync(storedProfileId, storedModelId, type, nextValue);
      switch (type) {
        case "reasoning_effort":
          setAIModelParameter(sync.conversation);
          break;
      }
      setGlobalAIProfileState(sync.global);
    },
    [setAIModelParameter, setGlobalAIProfileState, storedProfileId, storedModelId],
  );

  return {
    profileId: storedProfileId ?? "",
    modelId: resolvedModelId,
    modelName,
    models,
    isModelsLoading,
    isModelsError,
    areProfilesLoading,
    selectedProfile,
    profiles,
    defaultProfileId,
    missingSecretFieldLabels,
    provider,
    modelParameters,
    hasProfiles,
    handleModelProfileChange,
    handleModelParameterChange,
  };
}
