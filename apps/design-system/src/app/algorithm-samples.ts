import type { Algorithm } from "@koloda/srs";
import { DEFAULT_FSRS_ALGORITHM } from "@koloda/srs";

export const SAMPLE_ALGORITHM: Algorithm = {
  id: "0199a1d0-0000-7000-8000-000000000001",
  title: "Default",
  notes: "FSRS defaults: 90% retention, two learning steps, one relearning step.",
  content: DEFAULT_FSRS_ALGORITHM,
  createdAt: new Date("2026-09-15T10:00:00.000Z"),
  updatedAt: new Date("2026-10-02T17:45:00.000Z"),
};
