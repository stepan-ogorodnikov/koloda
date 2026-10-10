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
