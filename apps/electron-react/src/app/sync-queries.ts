import type { CreateSpaceData } from "@koloda/app";
import { queryKeys } from "@koloda/core-react";
import type { SyncQueries } from "@koloda/core-react";
import { invoke } from "./electron";

export const syncQueries: SyncQueries = {
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
  nudge: () => invoke("cmd_sync_nudge", undefined),
};
