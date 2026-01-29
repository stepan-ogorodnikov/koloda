import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod/v4";
import { algorithmFSRSValidation } from "./algorithms-fsrs";
import type { Timestamps } from "./db";
import type { UpdateData } from "./utility";

export const algorithmsMessages: Record<string, MessageDescriptor> = {
  "title.min-length": msg`title.min-length`,
  "title.max-length": msg`title.max-length`,
};

export const algorithmValidation = z.object({
  id: z.int(),
  title: z
    .string()
    .min(1, "title.min-length")
    .max(255, "title.max-length"),
  content: algorithmFSRSValidation,
});

export type Algorithm = Timestamps & z.infer<typeof algorithmValidation> & {
  id: number;
};

export const insertAlgorithmSchema = algorithmValidation.omit({ id: true });

export type InsertAlgorithmData = z.infer<typeof insertAlgorithmSchema>;

export const updateAlgorithmSchema = algorithmValidation.omit({ id: true });

export type UpdateAlgorithmValues = z.infer<typeof updateAlgorithmSchema>;

export type UpdateAlgorithmData = UpdateData<Algorithm, "id", UpdateAlgorithmValues>;

export type CloneAlgorithmData = z.infer<typeof cloneAlgorithmSchema>;

export const cloneAlgorithmSchema = insertAlgorithmSchema.pick({ title: true }).extend({ sourceId: z.string() });

export type DeleteAlgorithmData = {
  id: Algorithm["id"] | string;
  successorId?: Algorithm["id"] | string | null;
};
