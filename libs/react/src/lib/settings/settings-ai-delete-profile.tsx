import { aiQueryKeys, queriesAtom, settingsQueryKeys } from "@koloda/react";
import type { AIProfile } from "@koloda/srs";
import { Button, Dialog } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Trash2 } from "lucide-react";
import { useState } from "react";

type SettingsAIDeleteProfileProps = {
  profile: AIProfile;
};

export function SettingsAIDeleteProfile({ profile }: SettingsAIDeleteProfileProps) {
  const queryClient = useQueryClient();
  const { _ } = useLingui();
  const { removeAIProfileMutation } = useAtomValue(queriesAtom);
  const { mutate } = useMutation(removeAIProfileMutation());
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = () => {
    mutate({ id: profile.id }, {
      onSuccess: () => {
        setIsOpen(false);
        queryClient.invalidateQueries({ queryKey: settingsQueryKeys.detail("ai") });
        queryClient.invalidateQueries({ queryKey: aiQueryKeys.profiles() });
      },
    });
  };

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        variants={{ style: "ghost", size: "icon" }}
        aria-label={_(msg`settings.ai.profiles.delete.trigger`)}
      >
        <div className="p-1 rounded-md group-focus-ring">
          <Trash2 className="size-5 stroke-1.75" aria-hidden="true" />
        </div>
      </Button>
      <Dialog.Popover placement="left">
        <Dialog.Body>
          <Dialog.Content>
            <div className="flex flex-row items-center gap-4">
              {_(msg`settings.ai.delete.message`)}
              <Button variants={{ style: "primary", size: "small" }} onClick={handleDelete}>
                {_(msg`settings.ai.delete.confirm`)}
              </Button>
              <Button variants={{ style: "ghost", size: "small" }} slot="close" autoFocus>
                {_(msg`settings.ai.delete.cancel`)}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Body>
      </Dialog.Popover>
    </Dialog.Root>
  );
}
