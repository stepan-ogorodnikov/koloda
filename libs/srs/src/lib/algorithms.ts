import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod";
import { algorithmFSRSValidation } from "./algorithms-fsrs";
import type { Timestamps } from "./db";
import type { UpdateData } from "./utility";

export const algorithmsMessages: Record<string, MessageDescriptor> = {
  "validation.common.title.too-short": msg`validation.common.title.too-short`,
  "validation.common.title.too-long": msg`validation.common.title.too-long`,
};

export const algorithmValidation = z.object({
  id: z.int(),
  title: z
    .string()
    .min(1, "validation.common.title.too-short")
    .max(255, "validation.common.title.too-long"),
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

export const cloneAlgorithmSchema = insertAlgorithmSchema.pick({ title: true }).extend({
  sourceId: algorithmValidation.shape.id,
});

export type DeleteAlgorithmData = {
  id: Algorithm["id"];
  successorId?: Algorithm["id"] | null;
};
