import type { Modify } from "@koloda/app";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod";
import type { LessonAlgorithm } from "./algorithms";
import type { Card } from "./cards";
import type { Deck } from "./decks";
import type { InsertReviewData } from "./reviews";
import type { LessonTemplateRow, Template, TemplateField, TemplateLayoutItem } from "./templates";

export const LESSON_TYPES = ["untouched", "learn", "review", "total"] as const;

export const LESSON_TYPE_LABELS: Record<LessonType, MessageDescriptor> = {
  untouched: msg`lesson.init.labels.untouched`,
  learn: msg`lesson.init.labels.learn`,
  review: msg`lesson.init.labels.review`,
  total: msg`lesson.init.labels.total`,
} as const;

export type LessonType = (typeof LESSON_TYPES)[number];

export const lessonDeckSchema = z.object({
  // WHY: raw `db.execute` rows may surface int4/counts as string; coerce at this boundary.
  id: z.coerce.number().int(),
  title: z.string(),
  untouched: z.coerce.number(),
  learn: z.coerce.number(),
  review: z.coerce.number(),
  total: z.coerce.number(),
});

export type LessonDeck = z.infer<typeof lessonDeckSchema>;

export type LessonsResult = {
  total: LessonAmounts;
  decks: LessonDeck[];
};

export type LessonTableRow = LessonAmounts & {
  id: Deck["id"] | null;
  title: string | null;
};

export function toLessonTableRows({ total, decks }: LessonsResult): LessonTableRow[] {
  // WHY: Aggregate stays first to match the old UNION ALL … ORDER BY id NULLS FIRST shape.
  // LessonsTable pins row "0"; do not move the total row to the end.
  return [{ id: null, title: null, ...total }, ...decks];
}

export type LessonFilters = { deckIds?: Deck["id"][] };

export type LessonAmounts = Record<LessonType, number>;

export type LessonTemplateLayoutItem = Modify<
  TemplateLayoutItem,
  {
    field: TemplateField | undefined;
  }
>;

export type LessonTemplate = Modify<
  Template,
  {
    layout: LessonTemplateLayoutItem[];
  }
>;

export type GetLessonDataParams = {
  filters: LessonFilters;
  amounts: LessonAmounts;
};

export type LessonData = {
  cards: Card[];
  decks: Deck[];
  templates: LessonTemplate[];
  algorithms: LessonAlgorithm[];
};

export type LessonResultData = {
  card: Card;
  review: InsertReviewData;
};

export function convertTemplateToLessonTemplate(
  template: Pick<Template, "id" | "content"> | LessonTemplateRow,
): LessonTemplate {
  const layout: LessonTemplateLayoutItem[] = template.content.layout.map((entry) => ({
    ...entry,
    field: template.content.fields.find((x) => x.id === entry.field),
  }));
  return { ...template, layout } as LessonTemplate;
}
