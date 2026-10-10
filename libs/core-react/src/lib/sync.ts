import type {
  AppError,
  CreateSpaceData,
  ImportMode,
  IssuedPairing,
  JoinData,
  JoinedSpace,
  PreviewRequest,
  SpacePreview,
  SyncDevice,
  SyncStatus,
} from "@koloda/app";
import type { UseMutationOptions } from "@tanstack/react-query";
import { atom } from "jotai";
import type { AppQueryOptions } from "./queries";

export type SyncQueries = {
  getStatusQuery: () => AppQueryOptions<SyncStatus>;
  getDeviceNameQuery: () => AppQueryOptions<string>;
  createSpaceMutation: () => UseMutationOptions<SyncStatus, AppError, CreateSpaceData>;
  issuePairingMutation: () => UseMutationOptions<IssuedPairing, AppError, void>;
  getDevicesQuery: () => AppQueryOptions<SyncDevice[]>;
  revokeDeviceMutation: () => UseMutationOptions<void, AppError, { id: string }>;
  detachMutation: () => UseMutationOptions<SyncStatus, AppError, void>;
  previewMutation: () => UseMutationOptions<SpacePreview, AppError, PreviewRequest>;
  joinMutation: () => UseMutationOptions<JoinedSpace, AppError, JoinData>;
  importMutation: () => UseMutationOptions<SyncStatus, AppError, ImportMode>;
  nudge: () => Promise<void>;
};

// INVARIANT: set only by the desktop app, which runs the sync engine. The web demo never syncs and leaves it null,
// so it shows no Sync settings. Not a `Queries` method on purpose.
export const syncQueriesAtom = atom<SyncQueries | null>(null);
