import { aiQueryKeys, queriesAtom, settingsQueryKeys } from "@koloda/react";
import type { AIProfile, AISecrets } from "@koloda/srs";
import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { EditAIProfileLMStudio } from "./ai-providers/edit-ai-profile-lmstudio";
import { EditAIProfileOllama } from "./ai-providers/edit-ai-profile-ollama";
import { EditAIProfileOpenRouter } from "./ai-providers/edit-ai-profile-openrouter";

const PROVIDER_FORMS = {
  openrouter: EditAIProfileOpenRouter,
  ollama: EditAIProfileOllama,
  lmstudio: EditAIProfileLMStudio,
};

export type SettingsAIEditProfileProps = { profile: AIProfile };

export function SettingsAIEditProfile({ profile }: SettingsAIEditProfileProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { updateAIProfileMutation } = useAtomValue(queriesAtom);
  const { mutate, isPending, error, reset } = useMutation(updateAIProfileMutation());
  const [isOpen, setIsOpen] = useState(false);
  const provider = profile.secrets?.provider;
  const Form = provider ? PROVIDER_FORMS[provider] : null;

  const handleSubmit = (data: { title?: string; secrets?: AISecrets }) => {
    mutate({ id: profile.id, ...data }, {
      onSuccess: () => {
        setIsOpen(false);
        queryClient.invalidateQueries({ queryKey: settingsQueryKeys.detail("ai") });
        queryClient.invalidateQueries({ queryKey: aiQueryKeys.profiles() });
      },
    });
  };

  const handleOpenChange = (isOpen: boolean) => {
    setIsOpen(isOpen);
    if (!isOpen) reset();
  };

  if (!Form) return null;

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button
        variants={{ style: "ghost", size: "icon" }}
        aria-label={_(msg`settings.ai.edit.trigger`)}
        onClick={() => setIsOpen(true)}
      >
        <Pencil className="size-5 stroke-1.5" aria-hidden="true" />
      </Button>
      <Dialog.Overlay>
        <Dialog.Modal variants={{ class: "w-full max-w-96" }}>
          <Dialog.Body>
            <Dialog.Header>
              <Dialog.Title>
                {_(msg`settings.ai.edit.title`)}
              </Dialog.Title>
              <div className="grow" />
              <Dialog.Close slot="close" />
            </Dialog.Header>
            {error && <p className="fg-error">{error.details || error.message}</p>}
            <Form profile={profile} onSubmit={handleSubmit} isPending={isPending} />
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
