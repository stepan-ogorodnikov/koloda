import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AiProvider, AISecrets } from "@koloda/ai";
import { AI_PROVIDER_LABELS } from "@koloda/ai";
import { aiProvidersAtom } from "@koloda/core-react";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { Button, Dialog, Select } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { AddAIProfileForm } from "./ai-providers/add-ai-profile-form";

export type SettingsAIAddProfileProps = {
  trigger?: "icon" | "labeled";
};

export function SettingsAIAddProfile({ trigger = "icon" }: SettingsAIAddProfileProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { addAIProfileMutation } = useAtomValue(queriesAtom);
  const providerIds = useAtomValue(aiProvidersAtom);
  const { mutate, isPending, isSuccess, error, reset } = useMutation(addAIProfileMutation());
  const [isOpen, setIsOpen] = useState(false);
  const [provider, setProvider] = useState<AiProvider>("openrouter");
  const label = _(msg`settings.ai.add`);

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

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      {trigger === "labeled" ? (
        <Button variants={{ style: "primary" }} aria-label={label}>
          <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Add01Icon} aria-hidden="true" />
          {label}
        </Button>
      ) : (
        <Button variants={{ style: "dashed", size: "icon" }} aria-label={label}>
          <HugeiconsIcon className="size-4 min-w-4" strokeWidth={3} icon={Add01Icon} aria-hidden="true" />
        </Button>
      )}
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
            <AddAIProfileForm
              key={provider}
              provider={provider}
              onSubmit={handleSubmit}
              isPending={isPending}
              error={error}
            />
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
