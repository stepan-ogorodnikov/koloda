import { useAIModels, useAIProfiles } from "@koloda/react";
import type { ModelParameter } from "@koloda/srs";
import type { AIModel, AISecrets } from "@koloda/srs";
import { GENERATION_TEMPERATURE } from "@koloda/srs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type UseAIConfigurationReturn = {
  profileId: string;
  modelId: string;
  modelName: string | undefined;
  models: AIModel[];
  selectedProfile: ReturnType<typeof useAIProfiles>["selectedProfile"];
  profiles: ReturnType<typeof useAIProfiles>["profiles"];
  provider: AISecrets["provider"] | null;
  temperature: number;
  reasoningEffort: string;
  modelParameters: ModelParameter[];
  hasProfiles: boolean;
  handleProfileChange: (value: string) => void;
  handleModelChange: (value: string) => void;
  handleTemperatureChange: (value: number) => void;
  handleModelParameterChange: (type: ModelParameter["type"], value: string) => void;
};

export function useAIConfiguration(): UseAIConfigurationReturn {
  const [profileId, setProfileId] = useState("");
  const [modelId, setModelId] = useState("");
  const [temperature, setTemperature] = useState(GENERATION_TEMPERATURE);
  const [reasoningEffort, setReasoningEffort] = useState("");
  const { profiles, selectedProfile } = useAIProfiles(profileId);
  const { models } = useAIModels(profileId);
  const modelName = models.find((m) => m.id === modelId)?.name;
  const provider = selectedProfile?.secrets?.provider ?? null;
  const hasProfiles = profiles.length > 0;

  useEffect(() => {
    if (!profileId) {
      setModelId("");
      return;
    }

    if (modelId && models.some((model) => model.id === modelId)) return;

    const profile = profiles.find((item) => item.id === profileId);
    const preferredModelId = profile?.lastUsedModel;
    if (preferredModelId && models.some((model) => model.id === preferredModelId)) {
      setModelId(preferredModelId);
      return;
    }

    setModelId(models[0]?.id ?? "");
  }, [profileId, modelId, models, profiles]);

  const prevModelIdRef = useRef(modelId);

  useEffect(() => {
    const prevModelId = prevModelIdRef.current;
    prevModelIdRef.current = modelId;

    if (!modelId) {
      setReasoningEffort("");
      return;
    }

    if (prevModelId === modelId) return;

    const modelData = models.find((m) => m.id === modelId);
    setReasoningEffort(modelData?.default_reasoning_level ?? "");
  }, [modelId, models]);

  const modelParameters = useMemo((): ModelParameter[] => {
    const model = models.find((m) => m.id === modelId);
    const params: ModelParameter[] = [];

    const levels = model?.supported_reasoning_levels;
    if (levels && levels.length > 0) params.push({ type: "reasoning_effort", value: reasoningEffort, levels });

    return params;
  }, [modelId, models, reasoningEffort]);

  const handleProfileChange = useCallback((value: string) => {
    setProfileId(value);
    const profile = profiles.find((p) => p.id === value);
    setModelId(profile?.lastUsedModel ?? "");
  }, [profiles]);

  const handleModelChange = useCallback((value: string) => {
    setModelId(value);
  }, []);

  const handleTemperatureChange = useCallback((value: number) => {
    setTemperature(Number.isNaN(value) ? GENERATION_TEMPERATURE : Math.min(2, Math.max(0, value)));
  }, []);

  const handleModelParameterChange = useCallback((type: ModelParameter["type"], value: string) => {
    switch (type) {
      case "reasoning_effort":
        setReasoningEffort(value);
        break;
    }
  }, []);

  return {
    profileId,
    modelId,
    modelName,
    models,
    selectedProfile,
    profiles,
    provider,
    temperature,
    reasoningEffort,
    modelParameters,
    hasProfiles,
    handleProfileChange,
    handleModelChange,
    handleTemperatureChange,
    handleModelParameterChange,
  };
}
