// INVARIANT: mirrors the desktop addon's sync wire shapes (`apps/electron/src-rust/src/sync.rs`, `StatusWire`).
// Only the desktop syncs; the web demo never sees these.

export type SyncStop =
  | { reason: "clockSkew" }
  | { reason: "revoked" }
  | { reason: "unknownDevice" }
  | { reason: "authoritativeRestore" }
  | { reason: "restored" }
  | { reason: "pushRefused"; code: string }
  | { reason: "lowDisk"; needed: number; free: number }
  | { reason: "error"; message: string };

export type SyncState =
  | { type: "notEnrolled" }
  | { type: "importPending" }
  | { type: "bootstrapping" }
  | { type: "idle" }
  | { type: "syncing" }
  | { type: "stopped"; stop: SyncStop };

export type SyncHold = {
  lane: "hot" | "cold";
  seq: number;
  reason: "corruptEnvelope" | "updateRequired";
};

export type CreateSpaceData = {
  serverUrl: string;
  setupToken: string;
  spaceName: string;
  deviceName: string;
};

/** A pairing code another device joins with; `expiresAt` is in this device's clock. */
export type IssuedPairing = {
  code: string;
  expiresAt: number;
  serverUrl: string;
};

export type PreviewRequest = {
  serverUrl: string;
  code: string;
};

/** What a pairing code would join, before the code is used; `counts` is keyed by synced kind. */
export type SpacePreview = {
  spaceName: string;
  counts: Partial<Record<string, number>>;
  bytes: number;
};

export type JoinData = PreviewRequest & { deviceName: string };

/** `used` means the device waits for `ImportMode`; `knownIds` counts its ids the space already holds. */
export type JoinedSpace = {
  mode: "blank" | "untouchedSeed" | "used" | "reattach";
  knownIds: number;
  status: SyncStatus;
};

export type ImportMode = "add" | "replace";

export type SyncDevice = {
  id: string;
  name: string;
  platform: "desktop-win" | "desktop-mac" | "desktop-linux" | "ios" | "android";
  lastSeenAt: number;
  isRevoked: boolean;
  isSelf: boolean;
};

export type SyncStatus = {
  state: SyncState;
  lastSuccessAt: number | null;
  pending: number;
  held: number;
  uploads: number;
  fetches: number;
  lagHot: number | null;
  lagCold: number | null;
  skewMs: number;
  hold: SyncHold | null;
  isOverQuota: boolean;
  pushResumesAt: number | null;
};
