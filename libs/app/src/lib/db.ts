import { z } from "zod";

export type Timestamps = {
  createdAt: Date;
  updatedAt: Date | null;
};

export const timestampsValidation = z.object({
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
});

// INVARIANT: every Date-typed field in the shared schemas. Both hosts key their
// wire conversions on this list — web DATE_KEYS (libs/db-sqlite parse-rows) and
// the desktop renderer reviver (apps/electron-react ipc) — so a new timestamp
// field must be added here or it arrives as a string on one host and a Date on
// the other.
export const TIMESTAMP_FIELD_KEYS = ["createdAt", "updatedAt", "dueAt", "lastReviewedAt"] as const;
