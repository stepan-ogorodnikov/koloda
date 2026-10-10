import type { CreateSpaceData, ImportMode, InterfaceSettings, JoinData, PreviewRequest } from "@koloda/app";
import { queryKeys } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { invoke } from "./electron";
import { seedSettings } from "./setup";

// WHY: a blank database joins with the language and color scheme its setup screen shows; a used one keeps its own.
export const createSyncQueries = (getInterface: () => Partial<InterfaceSettings>): SyncQueries => ({
  getStatusQuery: () => ({
    queryKey: queryKeys.sync.status(),
    queryFn: () => invoke("cmd_sync_status", undefined),
  }),
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
