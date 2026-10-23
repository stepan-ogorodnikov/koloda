import type { AIProfile } from "@koloda/ai";
import { ERROR_MESSAGES, formatAppError } from "@koloda/app";
import { queriesAtom, queryKeys } from "@koloda/core-react";
import { Button, DeleteIcon, Dialog, ErrorMessage } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useState } from "react";

type SettingsAIDeleteProfileProps = {
  profile: AIProfile;
};

export function SettingsAIDeleteProfile({ profile }: SettingsAIDeleteProfileProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { removeAIProfileMutation } = useAtomValue(queriesAtom);
  const { mutate, error, reset } = useMutation(removeAIProfileMutation());
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = () => {
    mutate(
      { id: profile.id },
      {
        onSuccess: () => {
          setIsOpen(false);
          queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail("ai") });
          queryClient.invalidateQueries({ queryKey: queryKeys.ai.profiles() });
          queryClient.removeQueries({ queryKey: queryKeys.ai.models(profile.id) });
        },
      },
    );
  };

  const handleOpenChange = (next: boolean) => {
    setIsOpen(next);
    if (!next) reset();
  };

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button variants={{ style: "ghost", size: "icon" }} aria-label={_(msg`settings.ai.profiles.delete.trigger`)}>
        <div className="p-1 rounded-md group-focus-ring">
          <DeleteIcon className="size-5 min-w-5" strokeWidth={1.75} aria-hidden="true" />
        </div>
      </Button>
      <Dialog.Popover placement="left">
        <Dialog.Body>
          <Dialog.Content variants={{ class: "flex flex-col gap-4" }}>
            <div className="flex flex-row items-center gap-4">
              {_(msg`settings.ai.delete.message`)}
              <Button variants={{ style: "primary", size: "small" }} onClick={handleDelete}>
                {_(msg`settings.ai.delete.confirm`)}
              </Button>
              <Button variants={{ style: "ghost", size: "small" }} slot="close" autoFocus>
                {_(msg`settings.ai.delete.cancel`)}
              </Button>
            </div>
            {error && <ErrorMessage {...formatAppError(error, _, ERROR_MESSAGES["db.delete"])} layout="inline" />}
          </Dialog.Content>
        </Dialog.Body>
      </Dialog.Popover>
    </Dialog.Root>
  );
}
