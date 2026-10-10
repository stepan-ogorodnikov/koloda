import type { SyncStatus } from "@koloda/app";
import type { SyncQueries } from "@koloda/core-react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { SettingsSyncCreateSpace } from "./settings-sync-create-space";
import { SettingsSyncStatus } from "./settings-sync-status";

export type SettingsSyncProps = { status: SyncStatus; sync: SyncQueries };

export function SettingsSync({ status, sync }: SettingsSyncProps) {
  const { _ } = useLingui();

  return (
    <div className="self-center flex flex-col gap-4 w-full max-w-main p-4">
      {status.state.type === "notEnrolled" ? (
        <>
          <p className="fg-level-2">{_(msg`settings.sync.not-in-space`)}</p>
          <div className="flex flex-row gap-2">
            <SettingsSyncCreateSpace sync={sync} />
          </div>
        </>
      ) : (
        <SettingsSyncStatus status={status} sync={sync} />
      )}
    </div>
  );
}
