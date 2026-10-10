import { formatAppError } from "@koloda/app";
import type { IssuedPairing } from "@koloda/app";
import type { SyncQueries } from "@koloda/core-react";
import { Button, CopyIcon, Dialog, ErrorMessage } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const CODE_GROUP = /(.{5})(?=.)/g;

export type SettingsSyncInviteProps = { sync: SyncQueries };

export function SettingsSyncInvite({ sync }: SettingsSyncInviteProps) {
  const { _ } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const { mutate, data, error, isPending, reset } = useMutation(sync.issuePairingMutation());

  const handleOpenChange = (next: boolean) => {
    setIsOpen(next);
    if (next) mutate();
    else reset();
  };

  return (
    <Dialog.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button variants={{ style: "bordered" }}>{_(msg`settings.sync.invite`)}</Button>
      <Dialog.Overlay>
        <Dialog.Modal variants={{ class: "w-full max-w-96" }}>
          <Dialog.Body>
            <Dialog.Header>
              <Dialog.Title>{_(msg`settings.sync.invite.title`)}</Dialog.Title>
              <div className="grow" />
              <Dialog.Close slot="close" />
            </Dialog.Header>
            <Dialog.Content variants={{ class: "flex flex-col gap-4" }}>
              {error && <ErrorMessage {...formatAppError(error, _)} layout="inline" />}
              {data && <Pairing pairing={data} onNewCode={() => mutate()} isPending={isPending} />}
            </Dialog.Content>
            {error && (
              <Dialog.Footer>
                <div className="grow" />
                <Button variants={{ style: "primary" }} onPress={() => mutate()} isDisabled={isPending}>
                  {_(msg`settings.sync.invite.new-code`)}
                </Button>
              </Dialog.Footer>
            )}
          </Dialog.Body>
        </Dialog.Modal>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}

type PairingProps = { pairing: IssuedPairing; onNewCode: () => void; isPending: boolean };

function Pairing({ pairing, onNewCode, isPending }: PairingProps) {
  const { _ } = useLingui();
  const now = useNow();
  const secondsLeft = Math.max(0, Math.ceil((pairing.expiresAt - now) / 1000));

  if (secondsLeft === 0) {
    return (
      <>
        <p className="fg-level-2">{_(msg`settings.sync.invite.expired`)}</p>
        <Button variants={{ style: "primary" }} onPress={onNewCode} isDisabled={isPending}>
          {_(msg`settings.sync.invite.new-code`)}
        </Button>
      </>
    );
  }

  const timeLeft = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <>
      <p className="fg-level-2">{_(msg`settings.sync.invite.message`)}</p>
      <CopyRow
        label={_(msg`settings.sync.invite.code`)}
        value={pairing.code.replace(CODE_GROUP, "$1-")}
        copyLabel={_(msg`settings.sync.invite.copy-code`)}
      />
      <CopyRow
        label={_(msg`settings.sync.server-url.label`)}
        value={pairing.serverUrl}
        copyLabel={_(msg`settings.sync.invite.copy-server-url`)}
      />
      <p className="fg-level-2">{_(msg`settings.sync.invite.expires-in ${timeLeft}`)}</p>
    </>
  );
}

type CopyRowProps = { label: string; value: string; copyLabel: string };

function CopyRow({ label, value, copyLabel }: CopyRowProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="fg-level-2 text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-lg break-all">{value}</span>
        <Button
          variants={{ style: "ghost", size: "smallIcon" }}
          aria-label={copyLabel}
          onPress={() => {
            void navigator.clipboard.writeText(value);
          }}
        >
          <CopyIcon className="size-4 min-w-4" strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
