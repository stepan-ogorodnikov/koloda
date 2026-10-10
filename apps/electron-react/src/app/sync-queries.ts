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
  nudge: () => invoke("cmd_sync_nudge", undefined),
};
