import type { CreateSpaceData, ImportMode, InterfaceSettings, JoinData, PreviewRequest, SyncStatus } from "@koloda/app";
import { queryKeys } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import type { SyncStarter } from "@koloda/native-ipc";
import { invoke } from "./electron";
import { seedSettings } from "./setup";

export type SyncStart = {
  provide: (starter: SyncStarter) => void;
  getStatus: () => Promise<SyncStatus>;
};

// WHY: a failed start leaves the engine unstarted, and every other sync call fails until a start succeeds. So the
// status starts the engine until one does, and retrying the status retries the start. It waits for the starter, which
// the app provides once the database status is known.
export function createSyncStart(): SyncStart {
  let provide: (starter: SyncStarter) => void = () => {};
  const starter = new Promise<SyncStarter>((resolve) => {
    provide = resolve;
  });
  let isStarted = false;
  return {
    provide,
    getStatus: async () => {
      if (isStarted) return invoke("cmd_sync_status", undefined);
      const status = await invoke("cmd_sync_start", { starter: await starter });
      isStarted = true;
      return status;
    },
  };
}

export const syncStart = createSyncStart();

export const getSyncStatusQuery = () => ({ queryKey: queryKeys.sync.status(), queryFn: syncStart.getStatus });

// WHY: a blank database joins with the language and color scheme its setup screen shows; a used one keeps its own.
export const createSyncQueries = (getInterface: () => Partial<InterfaceSettings>): SyncQueries => ({
  getStatusQuery: getSyncStatusQuery,
  getDeviceNameQuery: () => ({
    queryKey: queryKeys.sync.deviceName(),
    queryFn: () => invoke("cmd_sync_device_name", undefined),
  }),
  createSpaceMutation: () => ({
    mutationFn: (data: CreateSpaceData) => invoke("cmd_sync_create_space", { data }),
  }),
  issuePairingMutation: () => ({
    mutationFn: () => invoke("cmd_sync_issue_pairing", undefined),
  }),
  getDevicesQuery: () => ({
    queryKey: queryKeys.sync.devices(),
    queryFn: () => invoke("cmd_sync_devices", undefined),
  }),
  revokeDeviceMutation: () => ({
    mutationFn: (data: { id: string }) => invoke("cmd_sync_revoke_device", data),
  }),
  detachMutation: () => ({
    mutationFn: () => invoke("cmd_sync_detach", undefined),
  }),
  previewMutation: () => ({
    mutationFn: (data: PreviewRequest) => invoke("cmd_sync_preview", { data }),
  }),
  joinMutation: () => ({
    mutationFn: (data: JoinData) =>
      invoke("cmd_sync_join", { data: { ...data, settings: seedSettings(getInterface()) } }),
  }),
  importMutation: () => ({
    mutationFn: (mode: ImportMode) => invoke("cmd_sync_import", { mode }),
  }),
  acceptRestoreMutation: () => ({
    mutationFn: () => invoke("cmd_sync_accept_restore", undefined),
  }),
  nudge: () => invoke("cmd_sync_nudge", undefined),
});
