import { useAIModels, useAIProfiles } from "@koloda/react";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { AISecrets, Deck, GenerateCardsInput, GeneratedCard, Template } from "@koloda/srs";
import { createAIGenerationClient, GENERATION_TEMPERATURE } from "@koloda/srs";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { createTextMessage, getGeneratedCardsMetadata } from "./generate-cards-utility";
import type { GeneratedCardsMessageProps } from "./generated-cards-message";
import { useGenerateCards } from "./use-generate-cards";
import type { StreamGenerator } from "./use-generate-cards";

export type UseGenerateCardsDialogReturn = {
  isOpen: boolean;
  profileId: string;
  modelId: string;
  modelName: string | undefined;
  provider: AISecrets["provider"] | null;
  temperature: number;
  messages: UIMessage[];
  template: Template | null | undefined;
  hasProfiles: boolean;
  isGenerating: boolean;
  generateError: Error | null;
  handleOpenChange: (open: boolean) => void;
  handleProfileChange: (value: string) => void;
  handleModelChange: (value: string) => void;
  handleTemperatureChange: (value: number) => void;
  handleGenerate: (value?: string) => Promise<void>;
  handleCancel: () => void;
  getGeneratedCardsProps: (message: UIMessage) => GeneratedCardsMessageProps | null;
};

export function useGenerateCardsDialog(deckId: Deck["id"], templateId: Template["id"]): UseGenerateCardsDialogReturn {
  const { _ } = useLingui();
  const { getTemplateQuery, touchAIProfileMutation } = useAtomValue(queriesAtom);
  const [isOpen, setIsOpen] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [modelId, setModelId] = useState("");
  const [temperature, setTemperature] = useState(GENERATION_TEMPERATURE);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [generatedRuns, setGeneratedRuns] = useState<Record<string, GeneratedCard[]>>({});
  const [canceledRuns, setCanceledRuns] = useState<Record<string, boolean>>({});
  const touchProfileMutation = useMutation(touchAIProfileMutation());
  const templateQuery = useQuery({ queryKey: queryKeys.templates.detail(templateId), ...getTemplateQuery(templateId) });
  const template = templateQuery.data;
  const { profiles, selectedProfile } = useAIProfiles(profileId);
  const { models } = useAIModels(profileId);
  const modelName = models.find((m) => m.id === modelId)?.name;

  const streamGenerator = useCallback<StreamGenerator>(
    async (input, onCard, abortSignal) => {
      if (!selectedProfile) throw new Error("No AI profile selected");
      if (!selectedProfile.secrets) throw new Error("No secrets loaded for AI profile");
      if (!template) throw new Error("No template loaded");

      const client = createAIGenerationClient(selectedProfile.secrets);
      await client.generateCards({ template, input, onCard, abortSignal });
    },
    [selectedProfile, template],
  );

  const {
    cards,
    isGenerating,
    error: generateError,
    generate,
    clearCards,
    cancel,
  } = useGenerateCards(streamGenerator);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setProfileId("");
      setModelId("");
      setPrompt("");
      setMessages([]);
      setActiveRunId(null);
      setGeneratedRuns({});
      setCanceledRuns({});
      clearCards();
      cancel();
    }
  }, [clearCards, cancel]);

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

  const handleGenerate = useCallback(async (value?: string) => {
    const promptText = (value ?? prompt).trim();
    if (!promptText || !profileId || !modelId) return;
    const runId = `${Date.now()}`;

    setActiveRunId(runId);
    setGeneratedRuns((prev) => ({ ...prev, [runId]: [] }));
    setCanceledRuns((prev) => ({ ...prev, [runId]: false }));
    clearCards();
    setPrompt("");
    setMessages((prev) => [
      ...prev,
      createTextMessage(`user-${runId}`, "user", promptText),
      createTextMessage(`assistant-${runId}`, "assistant", _(msg`generate-cards.generating`), {
        kind: "generated-cards",
        runId,
      }),
    ]);

    touchProfileMutation.mutate({ id: profileId, modelId });
    const input = {
      credentialId: profileId,
      modelId,
      prompt: promptText,
      temperature,
      deckId,
      templateId,
    } as GenerateCardsInput;
    await generate(input);
  }, [prompt, clearCards, touchProfileMutation, profileId, modelId, deckId, templateId, temperature, generate, _]);

  const handleCancel = useCallback(() => {
    if (activeRunId) {
      setCanceledRuns((prev) => ({ ...prev, [activeRunId]: true }));
    }
    cancel();
  }, [activeRunId, cancel]);

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

  useEffect(() => {
    if (!activeRunId) return;
    setGeneratedRuns((prev) => ({ ...prev, [activeRunId]: cards }));
  }, [activeRunId, cards]);

  const hasProfiles = profiles.length > 0;

  const getGeneratedCardsProps = useCallback((message: UIMessage): GeneratedCardsMessageProps | null => {
    const generatedCardsMetadata = getGeneratedCardsMetadata(message);
    if (!generatedCardsMetadata) return null;

    const runCards = generatedRuns[generatedCardsMetadata.runId] ?? [];
    const isCurrentRun = generatedCardsMetadata.runId === activeRunId;
    const canAdd = runCards.length > 0 && (!isCurrentRun || !isGenerating);

    return {
      cards: runCards,
      template,
      deckId,
      templateId,
      modelName,
      canAdd,
      isGenerating: isCurrentRun && isGenerating,
      isCanceled: !!canceledRuns[generatedCardsMetadata.runId],
    };
  }, [
    generatedRuns,
    canceledRuns,
    activeRunId,
    isGenerating,
    deckId,
    templateId,
    template,
    modelName,
  ]);

  return {
    isOpen,
    profileId,
    modelId,
    modelName,
    provider: selectedProfile?.secrets?.provider ?? null,
    temperature,
    messages,
    template,
    hasProfiles,
    isGenerating,
    generateError,
    handleOpenChange,
    handleProfileChange,
    handleModelChange,
    handleTemperatureChange,
    handleGenerate,
    handleCancel,
    getGeneratedCardsProps,
  };
}
