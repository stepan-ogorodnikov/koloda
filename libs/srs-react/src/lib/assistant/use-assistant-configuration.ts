import type { ModelParameter } from "@koloda/ai";
import type { AIModel, AISecrets } from "@koloda/ai";
import { useAIModels, useAIProfiles } from "@koloda/ai-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import {
  assistantAIProfileIdAtom,
  assistantAIModelIdAtom,
  assistantAIModelParametersAtom,
  setAssistantAIModelAtom,
  setAssistantAIModelParameterAtom,
  setAssistantAIProfileAtom,
} from "./assistant-conversation-atoms";

export type UseAssistantConfigurationReturn = {
  profileId: string;
  modelId: string;
  modelName: string | undefined;
  models: AIModel[];
  isModelsLoading: boolean;
  isModelsError: boolean;
  selectedProfile: ReturnType<typeof useAIProfiles>["selectedProfile"];
  profiles: ReturnType<typeof useAIProfiles>["profiles"];
  provider: AISecrets["provider"] | null;
  modelParameters: ModelParameter[];
  hasProfiles: boolean;
  handleProfileChange: (value: string) => void;
  handleModelChange: (value: string) => void;
  handleModelParameterChange: (type: ModelParameter["type"], value: string) => void;
};

export function useAssistantConfiguration(): UseAssistantConfigurationReturn {
  const storedProfileId = useAtomValue(assistantAIProfileIdAtom);
  const storedModelId = useAtomValue(assistantAIModelIdAtom);
  const storedModelParameters = useAtomValue(assistantAIModelParametersAtom);

  const setAIProfile = useSetAtom(setAssistantAIProfileAtom);
  const setAIModel = useSetAtom(setAssistantAIModelAtom);
  const setAIModelParameter = useSetAtom(setAssistantAIModelParameterAtom);

  const { profiles, selectedProfile } = useAIProfiles(storedProfileId);
  const { models, isLoading: isModelsLoading, isError: isModelsError } = useAIModels(storedProfileId);
  const provider = selectedProfile?.secrets?.provider ?? null;
  const hasProfiles = profiles.length > 0;

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
      setAIProfile({ profileId: value, modelId: profile?.lastUsedModel ?? null, modelParameters: {} });
    },
    [profiles, setAIProfile],
  );

  const handleModelChange = useCallback(
    (value: string) => {
      setAIModel({ modelId: value, modelParameters: {} });
    },
    [setAIModel],
  );

  const handleModelParameterChange = useCallback(
    (type: ModelParameter["type"], value: string) => {
      switch (type) {
        case "reasoning_effort":
          setAIModelParameter({ paramType: type, value: value || null });
          break;
      }
    },
    [setAIModelParameter],
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
    provider,
    modelParameters,
    hasProfiles,
    handleProfileChange,
    handleModelChange,
    handleModelParameterChange,
  };
}
