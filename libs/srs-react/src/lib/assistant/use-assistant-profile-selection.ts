import type { ModelParameter } from "@koloda/ai";
import type { AIModel, AISecrets } from "@koloda/ai";
import { useAIModels, useAIProfiles } from "@koloda/ai-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import type { AIProfileStateUpdater } from "./ai-profile-state";
import {
  assistantAIModelIdAtom,
  assistantAIModelParametersAtom,
  assistantProfileIdAtom,
  setAssistantAIModelAtom,
  setAssistantAIModelParameterAtom,
  setAssistantAIProfileAtom,
} from "./assistant-conversation-atoms";
import { useSetGlobalAIProfileState } from "./use-global-ai-profile-state";

export type UseAssistantProfileSelectionReturn = {
  profileId: string;
  modelId: string;
  modelName: string | undefined;
  models: AIModel[];
  isModelsLoading: boolean;
  isModelsError: boolean;
  selectedProfile: ReturnType<typeof useAIProfiles>["selectedProfile"];
  profiles: ReturnType<typeof useAIProfiles>["profiles"];
  defaultProfileId: string | null;
  missingSecretFieldLabels: string[];
  provider: AISecrets["provider"] | null;
  modelParameters: ModelParameter[];
  hasProfiles: boolean;
  setGlobalAIProfileState: (updater: AIProfileStateUpdater) => void;
  handleProfileChange: (value: string) => void;
  handleModelChange: (value: string) => void;
  handleModelParameterChange: (type: ModelParameter["type"], value: string) => void;
};

export function useAssistantProfileSelection(): UseAssistantProfileSelectionReturn {
  const storedProfileId = useAtomValue(assistantProfileIdAtom);
  const storedModelId = useAtomValue(assistantAIModelIdAtom);
  const storedModelParameters = useAtomValue(assistantAIModelParametersAtom);

  const setAIProfile = useSetAtom(setAssistantAIProfileAtom);
  const setAIModel = useSetAtom(setAssistantAIModelAtom);
  const setAIModelParameter = useSetAtom(setAssistantAIModelParameterAtom);

  const setGlobalAIProfileState = useSetGlobalAIProfileState();

  const {
    profiles,
    selectedProfile,
    defaultProfileId,
    missingSecretFieldLabels,
  } = useAIProfiles(storedProfileId);
  const { models, isLoading: isModelsLoading, isError: isModelsError } = useAIModels(storedProfileId);
  const provider = selectedProfile?.secrets?.provider ?? null;
  const hasProfiles = profiles.length > 0;

  useEffect(() => {
    if (defaultProfileId && !storedProfileId) {
      const profile = profiles.find((p) => p.id === defaultProfileId);
      setAIProfile({
        profileId: defaultProfileId,
        modelId: profile?.lastUsedModel ?? null,
        modelParameters: {},
      });
    }
  }, [defaultProfileId, storedProfileId, profiles, setAIProfile]);

  const resolvedModelId = useMemo(() => {
    if (!storedProfileId) return "";
    if (storedModelId && models.some((m) => m.id === storedModelId)) return storedModelId;
    const profile = profiles.find((p) => p.id === storedProfileId);
    if (profile?.lastUsedModel && models.some((m) => m.id === profile.lastUsedModel)) {
      return profile.lastUsedModel;
    }
    return models[0]?.id ?? "";
  }, [storedProfileId, storedModelId, models, profiles]);

  const modelName = models.find((m) => m.id === resolvedModelId)?.name;

  const modelParameters = useMemo((): ModelParameter[] => {
    const model = models.find((m) => m.id === resolvedModelId);
    const params: ModelParameter[] = [];

    const levels = model?.supported_reasoning_levels;
    if (levels && levels.length > 0) {
      const stored = storedModelParameters.reasoning_effort;
      const value = stored && levels.some((l) => l.effort === stored)
        ? stored
        : (model?.default_reasoning_level ?? "");
      params.push({ type: "reasoning_effort", value, levels });
    }

    return params;
  }, [resolvedModelId, models, storedModelParameters]);

  const handleProfileChange = useCallback(
    (value: string) => {
      const profile = profiles.find((p) => p.id === value);
      const modelId = profile?.lastUsedModel ?? null;
      setAIProfile({ profileId: value, modelId, modelParameters: {} });
      setGlobalAIProfileState({ profileId: value, modelId, modelParameters: {} });
    },
    [profiles, setAIProfile, setGlobalAIProfileState],
  );

  const handleModelChange = useCallback(
    (value: string) => {
      setAIModel({ modelId: value, modelParameters: {} });
      setGlobalAIProfileState({ profileId: storedProfileId, modelId: value, modelParameters: {} });
    },
    [setAIModel, setGlobalAIProfileState, storedProfileId],
  );

  const handleModelParameterChange = useCallback(
    (type: ModelParameter["type"], value: string) => {
      const nextValue = value || null;
      switch (type) {
        case "reasoning_effort":
          setAIModelParameter({ paramType: type, value: nextValue });
          break;
      }
      setGlobalAIProfileState({
        profileId: storedProfileId,
        modelId: storedModelId,
        modelParameters: { [type]: nextValue ?? "" },
      });
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
    selectedProfile,
    profiles,
    defaultProfileId,
    missingSecretFieldLabels,
    provider,
    modelParameters,
    hasProfiles,
    setGlobalAIProfileState,
    handleProfileChange,
    handleModelChange,
    handleModelParameterChange,
  };
}
