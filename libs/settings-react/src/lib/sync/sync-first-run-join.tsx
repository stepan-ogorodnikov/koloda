import type { SyncQueries } from "@koloda/core-react";
import { Dialog, RefreshIcon } from "@koloda/ui";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { JoinFlow } from "./settings-sync-join";

export type SyncFirstRunJoinProps = { sync: SyncQueries; onReady: () => void; onCancel: () => void };

// INVARIANT: a blank database that joined opens the app only once its first download ends; before that it has no
// algorithm or template for the screens that need one (`SYNC.md` §First run).
export function SyncFirstRunJoin({ sync, onReady, onCancel }: SyncFirstRunJoinProps) {
  const [hasJoined, setHasJoined] = useState(false);

  if (hasJoined) return <FirstDownload sync={sync} onReady={onReady} />;
  return <JoinFlow sync={sync} onDone={() => setHasJoined(true)} onCancel={onCancel} />;
}

type FirstDownloadProps = { sync: SyncQueries; onReady: () => void };

function FirstDownload({ sync, onReady }: FirstDownloadProps) {
  const { _ } = useLingui();
  const { data: status } = useQuery(sync.getStatusQuery());
  const state = status?.state;
  const isReady = state?.type === "idle" || state?.type === "syncing";
  const left = (status?.lagHot ?? 0) + (status?.lagCold ?? 0);

  useEffect(() => {
    if (isReady) onReady();
  }, [isReady, onReady]);

  return (
    <Dialog.Content variants={{ class: "flex flex-col items-center gap-4 text-center" }}>
      <RefreshIcon className="size-6 min-w-6 animate-spin" strokeWidth={1.75} aria-hidden="true" />
      <p>{_(msg`settings.sync.first-run.downloading`)}</p>
      {left > 0 && <p className="fg-level-2">{_(msg`${plural(left, { other: "settings.sync.download-left" })}`)}</p>}
      {state?.type === "stopped" && (
        <p className="fg-level-2">
          {state.stop.reason === "error" ? state.stop.message : _(msg`settings.sync.state.stopped`)}
        </p>
      )}
    </Dialog.Content>
  );
}
