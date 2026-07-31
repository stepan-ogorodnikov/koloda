import type { UpdateData } from "@koloda/app";
import { timestampsValidation } from "@koloda/app";
import { z } from "zod";
import { algorithmFSRSValidation } from "./algorithms-fsrs";

export const algorithmValidation = z.object({
  id: z.int(),
  title: z.string().min(1, "validation.common.title.too-short").max(255, "validation.common.title.too-long"),
  content: algorithmFSRSValidation,
});

export const algorithmRowSchema = algorithmValidation.extend(timestampsValidation.shape);

/** Partial algorithm row from lesson SQL (`id` + `content` only). */
export const lessonAlgorithmRowSchema = algorithmValidation.pick({ id: true, content: true }).extend({
  // WHY: raw `db.execute` rows may surface int4 as string; coerce at this boundary.
  id: z.coerce.number().int(),
});

export type Algorithm = z.infer<typeof algorithmRowSchema>;

export type LessonAlgorithm = z.infer<typeof lessonAlgorithmRowSchema>;

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
