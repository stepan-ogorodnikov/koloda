import type { SyncStatus } from "@koloda/app";
import type { SyncQueries } from "@koloda/core-react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { SettingsSyncCreateSpace } from "./settings-sync-create-space";
import { SettingsSyncDevices } from "./settings-sync-devices";
import { SettingsSyncJoin } from "./settings-sync-join";
import { SettingsSyncStatus } from "./settings-sync-status";
import { SyncImportChoice } from "./sync-import-choice";

export type SettingsSyncProps = { status: SyncStatus; sync: SyncQueries };

export function SettingsSync({ status, sync }: SettingsSyncProps) {
  const { _ } = useLingui();
  const { state } = status;
  // WHY: a revoked device and one that left both stay detached; only a join brings them back.
  const hasLeft = state.type === "stopped" && state.stop.reason === "revoked";

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
          <p className="fg-level-2">{_(msg`settings.sync.left`)}</p>
          <div className="flex flex-row gap-2">
            <SettingsSyncJoin sync={sync} />
          </div>
        </>
      )}
      {state.type === "importPending" && <SyncImportChoice sync={sync} />}
      {state.type !== "notEnrolled" && state.type !== "importPending" && !hasLeft && (
        <>
          <SettingsSyncStatus status={status} sync={sync} />
          <SettingsSyncDevices sync={sync} />
        </>
      )}
    </div>
  );
}
