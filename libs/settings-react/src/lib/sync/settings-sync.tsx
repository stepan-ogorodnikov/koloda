import type { SyncStatus } from "@koloda/app";
import type { SyncQueries } from "@koloda/core-react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { SettingsSyncCreateSpace } from "./settings-sync-create-space";
import { SettingsSyncDevices } from "./settings-sync-devices";
import { SettingsSyncJoin } from "./settings-sync-join";
import { SettingsSyncStatus } from "./settings-sync-status";
import { SyncLeaveSpace } from "./sync-leave-space";
import { SyncImportChoice } from "./sync-import-choice";
import { useSyncStopMessage } from "./sync-messages";

export type SettingsSyncProps = { status: SyncStatus; sync: SyncQueries };

export function SettingsSync({ status, sync }: SettingsSyncProps) {
  const { _ } = useLingui();
  const stopMessage = useSyncStopMessage()(status);
  const { state } = status;
  // WHY: the file is detached, so only a join brings it back: it left, another device removed it, or a restore left
  // it out.
  const hasLeft = state.type === "stopped" && (state.stop.reason === "revoked" || state.stop.reason === "restored");
  // WHY: the server no longer knows this device, but the file stays attached, and an attached file cannot join;
  // leaving works all the same, since the engine takes that answer as a revocation (PROTOCOL.md §Devices).
  const isUnknown = state.type === "stopped" && state.stop.reason === "unknownDevice";

  return (
    <div className="self-center flex flex-col gap-4 w-full max-w-main p-4">
      {state.type === "notEnrolled" && (
        <>
          <p className="fg-level-2">{_(msg`settings.sync.not-in-space`)}</p>
          <div className="flex flex-row gap-2">
            <SettingsSyncCreateSpace sync={sync} />
            <SettingsSyncJoin sync={sync} />
          </div>
        </>
      )}
      {hasLeft && (
        <>
          <p className="fg-level-2">{stopMessage}</p>
          <div className="flex flex-row gap-2">
            <SettingsSyncJoin sync={sync} />
          </div>
        </>
      )}
      {isUnknown && (
        <>
          <p className="fg-level-2">{stopMessage}</p>
          <div>
            <SyncLeaveSpace sync={sync} />
          </div>
        </>
      )}
      {state.type === "importPending" && <SyncImportChoice sync={sync} />}
      {state.type !== "notEnrolled" && state.type !== "importPending" && !hasLeft && !isUnknown && (
        <>
          <SettingsSyncStatus status={status} sync={sync} />
          <SettingsSyncDevices sync={sync} />
        </>
      )}
    </div>
  );
}
