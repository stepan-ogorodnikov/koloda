import { z } from "zod";

// INVARIANT: twin of `MAX_NAME_CHARS` in `koloda-sync-proto`; the server refuses a longer space or device name.
const NAME_MAX_LENGTH = 100;

const nameSchema = z
  .string()
  .trim()
  .min(1, "validation.sync.name.too-short")
  .max(NAME_MAX_LENGTH, "validation.sync.name.too-long");

// WHY: only emptiness is checked here; the engine owns the URL rule (https, or http to this machine).
export const createSpaceSchema = z.object({
  serverUrl: z.string().trim().min(1, "validation.sync.server-url"),
  setupToken: z.string().trim().min(1, "validation.sync.setup-token"),
  spaceName: nameSchema,
  deviceName: nameSchema,
});

export const joinSchema = z.object({
  serverUrl: z.string().trim().min(1, "validation.sync.server-url"),
  code: z.string().trim().min(1, "validation.sync.pairing-code"),
  deviceName: nameSchema,
});
