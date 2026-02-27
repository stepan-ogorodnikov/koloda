import { aiQueryKeys, queriesAtom, settingsQueryKeys } from "@koloda/react";
import type { AddAIProfileFormProps, AiProvider, AISecrets } from "@koloda/srs";
import { AI_PROVIDER_LABELS, AI_PROVIDERS } from "@koloda/srs";
import { Button, Dialog, Select } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { PlusIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { AddAIProfileLMStudio } from "./ai-providers/add-ai-profile-lmstudio";
import { AddAIProfileOllama } from "./ai-providers/add-ai-profile-ollama";
import { AddAIProfileOpenRouter } from "./ai-providers/add-ai-profile-openrouter";

const PROVIDER_FORMS: Record<AiProvider, ComponentType<AddAIProfileFormProps>> = {
  openrouter: AddAIProfileOpenRouter,
  ollama: AddAIProfileOllama,
  lmstudio: AddAIProfileLMStudio,
};

export function SettingsAIAddProfile() {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { addAIProfileMutation } = useAtomValue(queriesAtom);
  const { mutate, isPending, isSuccess, error, reset } = useMutation(addAIProfileMutation());
  const [isOpen, setIsOpen] = useState(false);
  const [provider, setProvider] = useState<AiProvider>("openrouter");

  const handleSubmit = (data: { title?: string; secrets: AISecrets }) => {
    mutate(data, {
      onSuccess: () => {
        setIsOpen(false);
        queryClient.invalidateQueries({ queryKey: settingsQueryKeys.detail("ai") });
        queryClient.invalidateQueries({ queryKey: aiQueryKeys.profiles() });
      },
    });
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) reset();
  };

  useEffect(() => {
    if (isSuccess) reset();
  }, [isSuccess, reset]);

  const Form = PROVIDER_FORMS[provider];

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button variants={{ style: "dashed", size: "icon" }} aria-label={_(msg`settings.ai.add`)}>
        <PlusIcon className="size-4" />
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
                {AI_PROVIDERS.map((id) => (
                  <Select.ListBoxItem id={id} textValue={AI_PROVIDER_LABELS[id]} key={id}>
                    {AI_PROVIDER_LABELS[id]}
                  </Select.ListBoxItem>
                ))}
              </Select>
            </div>
            {error && <p className="fg-error">{error.details || error.message}</p>}
            <Form onSubmit={handleSubmit} isPending={isPending} />
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
