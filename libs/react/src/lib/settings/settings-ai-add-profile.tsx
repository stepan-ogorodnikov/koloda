import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { aiProvidersAtom } from "@koloda/react";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { AddAIProfileFormProps, AiProvider, AISecrets } from "@koloda/srs";
import { AI_PROVIDER_LABELS } from "@koloda/srs";
import { Button, Dialog, Select } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { AddAIProfileLMStudio } from "./ai-providers/add-ai-profile-lmstudio";
import { AddAIProfileOllama } from "./ai-providers/add-ai-profile-ollama";
import { AddAIProfileOpenRouter } from "./ai-providers/add-ai-profile-openrouter";
import { AddAIProfileCodex } from "./ai-providers/add-ai-profile-codex";

const PROVIDER_FORMS: Record<AiProvider, ComponentType<AddAIProfileFormProps>> = {
  openrouter: AddAIProfileOpenRouter,
  ollama: AddAIProfileOllama,
  lmstudio: AddAIProfileLMStudio,
  codex: AddAIProfileCodex,
};

export function SettingsAIAddProfile() {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { addAIProfileMutation } = useAtomValue(queriesAtom);
  const providerIds = useAtomValue(aiProvidersAtom);
  const { mutate, isPending, isSuccess, error, reset } = useMutation(addAIProfileMutation());
  const [isOpen, setIsOpen] = useState(false);
  const [provider, setProvider] = useState<AiProvider>("openrouter");

  const handleSubmit = (data: { title?: string; secrets: AISecrets }) => {
    mutate(data, {
      onSuccess: () => {
        setIsOpen(false);
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail("ai") });
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.profiles() });
      },
    });
  };

  const handleOpenChange = (isOpen: boolean) => {
    setIsOpen(isOpen);
    if (!isOpen) reset();
  };

  useEffect(() => {
    if (isSuccess) reset();
  }, [isSuccess, reset]);

  useEffect(() => {
    if (!providerIds.includes(provider)) {
      setProvider(providerIds[0] ?? "openrouter");
    }
  }, [provider, providerIds]);

  const Form = PROVIDER_FORMS[provider];

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button variants={{ style: "dashed", size: "icon" }} aria-label={_(msg`settings.ai.add`)}>
        <HugeiconsIcon className="size-4 min-w-4" strokeWidth={3} icon={Add01Icon} aria-hidden="true" />
      </Button>
      <Dialog.Overlay>
        <Dialog.Modal variants={{ class: "w-full max-w-96" }}>
          <Dialog.Body>
            <Dialog.Header>
              <Dialog.Title>{_(msg`settings.ai.add.title`)}</Dialog.Title>
              <div className="grow" />
              <Dialog.Close slot="close" />
            </Dialog.Header>
            <div className="px-4 pt-2">
              <Select
                label={_(msg`settings.ai.profiles.provider.label`)}
                value={provider}
                onChange={(key) => {
                  if (key) setProvider(key.toString() as AiProvider);
                }}
              >
                {providerIds.map((id) => (
                  <Select.ListBoxItem id={id} textValue={AI_PROVIDER_LABELS[id]} key={id}>
                    {AI_PROVIDER_LABELS[id]}
                  </Select.ListBoxItem>
                ))}
              </Select>
            </div>
            <Form onSubmit={handleSubmit} isPending={isPending} error={error} />
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
