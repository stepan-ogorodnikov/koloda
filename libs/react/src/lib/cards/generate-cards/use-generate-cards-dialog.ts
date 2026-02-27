import {
  cardsQueryKeys,
  queriesAtom,
  settingsQueryKeys,
  templatesQueryKeys,
  useAIModels,
  useAIProfiles,
} from "@koloda/react";
import type { Deck, GenerateCardsInput, GeneratedCard, InsertCardData, Template } from "@koloda/srs";
import { createAIGenerationClient, transformGeneratedCards } from "@koloda/srs";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  prompt: string;
  messages: UIMessage[];
  template: Template | null | undefined;
  hasProfiles: boolean;
  isGenerating: boolean;
  generateError: Error | null;
  handleOpenChange: (open: boolean) => void;
  handleProfileChange: (value: string) => void;
  handleModelChange: (value: string) => void;
  handlePromptChange: (value: string) => void;
  handleGenerate: () => Promise<void>;
  getGeneratedCardsProps: (message: UIMessage) => GeneratedCardsMessageProps | null;
};

export type AddCardsMutationResult = {
  type: "success" | "error";
  message: string;
};

export function useGenerateCardsDialog(deckId: Deck["id"], templateId: Template["id"]): UseGenerateCardsDialogReturn {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const { getTemplateQuery, addCardsMutation, touchAIProfileMutation } = useAtomValue(queriesAtom);
  const [isOpen, setIsOpen] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [generatedRuns, setGeneratedRuns] = useState<Record<string, GeneratedCard[]>>({});
  const [addingRunId, setAddingRunId] = useState<string | null>(null);
  const [mutationResult, setMutationResult] = useState<Record<string, AddCardsMutationResult | null>>({});
  const cardsMutation = useMutation(addCardsMutation());
  const touchProfileMutation = useMutation(touchAIProfileMutation());
  const templateQuery = useQuery({ queryKey: templatesQueryKeys.detail(templateId), ...getTemplateQuery(templateId) });
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
      setAddingRunId(null);
      setMutationResult({});
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

  const handlePromptChange = useCallback((value: string) => {
    setPrompt(value);
  }, []);

  const handleGenerate = useCallback(async () => {
    const promptText = prompt.trim();
    if (!promptText || !profileId || !modelId) return;
    const runId = `${Date.now()}`;

    setActiveRunId(runId);
    setGeneratedRuns((prev) => ({ ...prev, [runId]: [] }));
    setMutationResult((prev) => ({ ...prev, [runId]: null }));
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
    const input: GenerateCardsInput = {
      credentialId: profileId,
      modelId,
      prompt: promptText,
      deckId,
      templateId,
    };
    await generate(input);
  }, [prompt, clearCards, touchProfileMutation, profileId, modelId, deckId, templateId, generate, _]);

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

  const handleAddCards = useCallback((runId: string) => {
    const runCards = generatedRuns[runId] ?? [];
    if (!template || runCards.length === 0) return;

    const cardsToCreate: InsertCardData[] = transformGeneratedCards(runCards, deckId, templateId);

    setAddingRunId(runId);
    cardsMutation.mutate(cardsToCreate, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: cardsQueryKeys.deck({ deckId }) });
        queryClient.invalidateQueries({ queryKey: settingsQueryKeys.detail("ai") });
        setMutationResult((prev) => ({
          ...prev,
          [runId]: {
            type: "success",
            message: _(msg`${plural(cardsToCreate.length, { other: "generate-cards.add.success" })}`),
          },
        }));
      },
      onError: (error) => {
        setMutationResult((prev) => ({
          ...prev,
          [runId]: {
            type: "error",
            message: error instanceof Error ? error.message : _(msg`generate-cards.add.error`),
          },
        }));
      },
      onSettled: () => {
        setAddingRunId(null);
      },
    });
  }, [_, generatedRuns, template, deckId, templateId, cardsMutation, queryClient]);

  const hasProfiles = profiles.length > 0;

  const getGeneratedCardsProps = useCallback((message: UIMessage): GeneratedCardsMessageProps | null => {
    const generatedCardsMetadata = getGeneratedCardsMetadata(message);
    if (!generatedCardsMetadata) return null;

    const runCards = generatedRuns[generatedCardsMetadata.runId] ?? [];
    const isCurrentRun = generatedCardsMetadata.runId === activeRunId;
    const canCreate = runCards.length > 0 && (!isCurrentRun || !isGenerating);
    const isCreating = cardsMutation.isPending && addingRunId === generatedCardsMetadata.runId;

    return {
      cards: runCards,
      template,
      modelName,
      onAddCards: () => handleAddCards(generatedCardsMetadata.runId),
      canCreate,
      isCreating,
      isGenerating: isCurrentRun && isGenerating,
      mutationResult: mutationResult[generatedCardsMetadata.runId] ?? null,
    };
  }, [
    generatedRuns,
    activeRunId,
    isGenerating,
    cardsMutation.isPending,
    addingRunId,
    template,
    modelName,
    handleAddCards,
    mutationResult,
  ]);

  return {
    isOpen,
    profileId,
    modelId,
    modelName,
    prompt,
    messages,
    template,
    hasProfiles,
    isGenerating,
    generateError,
    handleOpenChange,
    handleProfileChange,
    handleModelChange,
    handlePromptChange,
    handleGenerate,
    getGeneratedCardsProps,
  };
}
