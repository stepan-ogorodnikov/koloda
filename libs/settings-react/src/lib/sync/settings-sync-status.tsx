import type { SyncState, SyncStatus } from "@koloda/app";
import { useTimestampFormatter } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { Button } from "@koloda/ui";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

const STATE_LABELS = {
  notEnrolled: msg`settings.sync.state.not-enrolled`,
  importPending: msg`settings.sync.state.import-pending`,
  bootstrapping: msg`settings.sync.state.bootstrapping`,
  idle: msg`settings.sync.state.idle`,
  syncing: msg`settings.sync.state.syncing`,
  stopped: msg`settings.sync.state.stopped`,
} satisfies Record<SyncState["type"], unknown>;

export type SettingsSyncStatusProps = { status: SyncStatus; sync: SyncQueries };

export function SettingsSyncStatus({ status, sync }: SettingsSyncStatusProps) {
  const { _ } = useLingui();
  const formatTimestamp = useTimestampFormatter();
  const { state, lastSuccessAt, pending, uploads, fetches } = status;
  // WHY: the two lanes are an engine detail; the user sees one download.
  const left = (status.lagHot ?? 0) + (status.lagCold ?? 0);
  const lastSync = lastSuccessAt === null ? null : formatTimestamp(new Date(lastSuccessAt), "datetime");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">{_(STATE_LABELS[state.type])}</h2>
        <Button variants={{ style: "bordered" }} onClick={() => void sync.nudge()}>
          {_(msg`settings.sync.sync-now`)}
        </Button>
      </div>
      {state.type === "stopped" && state.stop.reason === "error" && <p className="fg-level-2">{state.stop.message}</p>}
      {state.type === "bootstrapping" && left > 0 && (
        <p>{_(msg`${plural(left, { other: "settings.sync.download-left" })}`)}</p>
      )}
      <p className="fg-level-2">
        {lastSync === null ? _(msg`settings.sync.last-sync.none`) : _(msg`settings.sync.last-sync ${lastSync}`)}
      </p>
      {pending > 0 && <p className="fg-level-2">{_(msg`${plural(pending, { other: "settings.sync.pending" })}`)}</p>}
      {uploads > 0 && <p className="fg-level-2">{_(msg`${plural(uploads, { other: "settings.sync.uploads" })}`)}</p>}
      {fetches > 0 && <p className="fg-level-2">{_(msg`${plural(fetches, { other: "settings.sync.fetches" })}`)}</p>}
    </div>
  );
}
