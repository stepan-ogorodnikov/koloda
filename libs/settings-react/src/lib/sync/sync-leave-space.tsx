import { formatAppError } from "@koloda/app";
import { queryKeys } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { Button, Dialog, ErrorMessage } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export type SyncLeaveSpaceProps = { sync: SyncQueries };

export function SyncLeaveSpace({ sync }: SyncLeaveSpaceProps) {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const { mutate, error, isPending, reset } = useMutation(sync.detachMutation());

  const handleOpenChange = (next: boolean) => {
    setIsOpen(next);
    if (!next) reset();
  };

  const handleLeave = () => {
    mutate(undefined, {
      onSuccess: (status) => {
        setIsOpen(false);
        // WHY: the list marked this device as its own; after a later join it is another device of that space.
        queryClient.removeQueries({ queryKey: queryKeys.sync.devices() });
        queryClient.setQueryData(queryKeys.sync.status(), status);
      },
    });
  };

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button variants={{ style: "bordered" }}>{_(msg`settings.sync.leave`)}</Button>
      <Dialog.Popover placement="bottom start">
        <Dialog.Body>
          <Dialog.Content variants={{ class: "flex flex-col gap-2 max-w-96" }}>
            <p>{_(msg`settings.sync.leave.message`)}</p>
            {error && <ErrorMessage {...formatAppError(error, _)} layout="inline" />}
            <div className="flex flex-row gap-2">
              <Button variants={{ style: "primary", size: "small" }} onPress={handleLeave} isDisabled={isPending}>
                {_(msg`settings.sync.leave.confirm`)}
              </Button>
              <Button variants={{ style: "ghost", size: "small" }} slot="close" autoFocus>
                {_(msg`settings.sync.cancel`)}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Body>
      </Dialog.Popover>
    </Dialog.Root>
  );
}
