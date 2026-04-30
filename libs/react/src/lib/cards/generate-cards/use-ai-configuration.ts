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
  const [preferredModelId, setPreferredModelId] = useState("");
  const [temperature, setTemperature] = useState(GENERATION_TEMPERATURE);
  const [reasoningEffort, setReasoningEffort] = useState("");
  const { profiles, selectedProfile } = useAIProfiles(profileId);
  const { models } = useAIModels(profileId);
  const provider = selectedProfile?.secrets?.provider ?? null;
  const hasProfiles = profiles.length > 0;

  const modelId = useMemo(() => {
    if (!profileId) return "";
    if (preferredModelId && models.some((m) => m.id === preferredModelId)) return preferredModelId;
    const profile = profiles.find((p) => p.id === profileId);
    if (profile?.lastUsedModel && models.some((m) => m.id === profile.lastUsedModel)) {
      return profile.lastUsedModel;
    }
    return models[0]?.id ?? "";
  }, [profileId, preferredModelId, models, profiles]);

  const modelName = models.find((m) => m.id === modelId)?.name;

  const prevModelIdRef = useRef(modelId);

  useEffect(() => {
    if (prevModelIdRef.current === modelId) return;
    prevModelIdRef.current = modelId;

    if (!modelId) {
      setReasoningEffort("");
      return;
    }

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
    setPreferredModelId(profile?.lastUsedModel ?? "");
  }, [profiles]);

  const handleModelChange = useCallback((value: string) => {
    setPreferredModelId(value);
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
