import { Delete03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { AIProfile } from "@koloda/srs";
import { Button, Dialog } from "@koloda/ui";
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
  const { mutate } = useMutation(removeAIProfileMutation());
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = () => {
    mutate({ id: profile.id }, {
      onSuccess: () => {
        setIsOpen(false);
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail("ai") });
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.profiles() });
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
          <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={Delete03Icon} aria-hidden="true" />
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
