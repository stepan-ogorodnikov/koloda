import { formatAppError } from "@koloda/app";
import type { SyncStatus } from "@koloda/app";
import { queryKeys, useTimestampFormatter } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { Button, Dialog, ErrorMessage } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSyncStopMessage } from "./sync-messages";

export type SettingsSyncProblemsProps = { status: SyncStatus; sync: SyncQueries };

export function SettingsSyncProblems({ status, sync }: SettingsSyncProblemsProps) {
  const { _ } = useLingui();
  const formatTimestamp = useTimestampFormatter();
  const stopMessage = useSyncStopMessage()(status);
  const { state, hold, isOverQuota, pushResumesAt } = status;
  const isRestoreHeld = state.type === "stopped" && state.stop.reason === "authoritativeRestore";
  const resumesAt = pushResumesAt === null ? null : formatTimestamp(new Date(pushResumesAt), "time");

  return (
    <>
      {stopMessage && <p>{stopMessage}</p>}
      {isRestoreHeld && (
        <div>
          <AcceptRestore sync={sync} />
        </div>
      )}
      {hold?.reason === "updateRequired" && <p>{_(msg`settings.sync.hold.update-required`)}</p>}
      {hold?.reason === "corruptEnvelope" && <CorruptEnvelope lane={hold.lane} seq={hold.seq} />}
      {isOverQuota && <p>{_(msg`settings.sync.over-quota`)}</p>}
      {resumesAt && <p>{_(msg`settings.sync.push-waits ${resumesAt}`)}</p>}
    </>
  );
}

type CorruptEnvelopeProps = { lane: string; seq: number };

function CorruptEnvelope({ lane, seq }: CorruptEnvelopeProps) {
  const { _ } = useLingui();

  return (
    <div className="flex flex-col gap-1">
      <p>{_(msg`settings.sync.hold.corrupt ${lane} ${seq}`)}</p>
      <code className="font-mono text-sm break-all">{`koloda-server drop-envelope --data-dir <data-dir> <space> ${lane} ${seq}`}</code>
      <p className="fg-level-2 text-sm">{_(msg`settings.sync.hold.corrupt.spaces`)}</p>
    </div>
  );
}

type AcceptRestoreProps = { sync: SyncQueries };

function AcceptRestore({ sync }: AcceptRestoreProps) {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const { mutate, error, isPending, reset } = useMutation(sync.acceptRestoreMutation());

  const handleOpenChange = (next: boolean) => {
    setIsOpen(next);
    if (!next) reset();
  };

  const handleAccept = () => {
    mutate(undefined, {
      onSuccess: (status) => {
        setIsOpen(false);
        queryClient.setQueryData(queryKeys.sync.status(), status);
      },
    });
  };

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button variants={{ style: "primary" }}>{_(msg`settings.sync.restore.continue`)}</Button>
      <Dialog.Popover placement="bottom start">
        <Dialog.Body>
          <Dialog.Content variants={{ class: "flex flex-col gap-2 max-w-96" }}>
            <p>{_(msg`settings.sync.restore.message`)}</p>
            {error && <ErrorMessage {...formatAppError(error, _)} layout="inline" />}
            <div className="flex flex-row gap-2">
              <Button variants={{ style: "primary", size: "small" }} onPress={handleAccept} isDisabled={isPending}>
                {_(msg`settings.sync.restore.confirm`)}
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
