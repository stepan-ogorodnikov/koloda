import type { SyncStatus } from "@koloda/app";
import { useTimestampFormatter } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { AlertIcon, Button, RefreshIcon, SuccessIcon, Tooltip } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useSyncStopMessage } from "./sync-messages";

export type SyncIndicatorProps = { sync: SyncQueries; onOpen: () => void };

// WHY: a device that never joined a space, or that left one, chose not to sync; every other state shows here, so a
// stop that needs the user is seen outside Settings.
function isShown({ state }: SyncStatus) {
  return state.type !== "notEnrolled" && !(state.type === "stopped" && state.stop.reason === "revoked");
}

function needsAttention({ state, hold, isOverQuota }: SyncStatus) {
  return state.type === "stopped" || state.type === "importPending" || hold !== null || isOverQuota;
}

export function SyncIndicator({ sync, onOpen }: SyncIndicatorProps) {
  const { _ } = useLingui();
  const formatTimestamp = useTimestampFormatter();
  const stopMessage = useSyncStopMessage();
  const { data: status } = useQuery(sync.getStatusQuery());

  if (!status || !isShown(status)) return null;

  const { state, lastSuccessAt } = status;
  const isBusy = state.type === "syncing" || state.type === "bootstrapping";
  const lastSync = lastSuccessAt === null ? null : formatTimestamp(new Date(lastSuccessAt), "datetime");
  const label = needsAttention(status)
    ? (stopMessage(status) ?? _(msg`settings.sync.indicator.attention`))
    : state.type === "syncing"
      ? _(msg`settings.sync.state.syncing`)
      : state.type === "bootstrapping"
        ? _(msg`settings.sync.state.bootstrapping`)
        : lastSync === null
          ? _(msg`settings.sync.state.idle`)
          : _(msg`settings.sync.last-sync ${lastSync}`);
  const Icon = needsAttention(status) ? AlertIcon : isBusy ? RefreshIcon : SuccessIcon;

  return (
    <Tooltip content={label}>
      <Button variants={{ style: "ghost", size: "smallIcon" }} aria-label={label} onPress={onOpen}>
        <Icon
          className={isBusy && !needsAttention(status) ? "size-5 min-w-5 animate-spin" : "size-5 min-w-5"}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </Button>
    </Tooltip>
  );
}
