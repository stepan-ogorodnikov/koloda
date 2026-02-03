import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { Algorithm } from "./algorithms";
import type { Card } from "./cards";
import type { Deck } from "./decks";
import type { InsertReviewData } from "./reviews";
import type { Template, TemplateField, TemplateLayoutItem } from "./templates";
import type { Modify } from "./utility";

export const LESSON_TYPES = ["untouched", "learn", "review", "total"] as const;

export const LESSON_TYPE_LABELS: Record<LessonType, MessageDescriptor> = {
  untouched: msg`lesson.init.labels.untouched`,
  learn: msg`lesson.init.labels.learn`,
  review: msg`lesson.init.labels.review`,
  total: msg`lesson.init.labels.total`,
} as const;

export type LessonType = typeof LESSON_TYPES[number];

export type Lesson = Record<LessonType, number> & {
  id: Deck["id"] | null;
  title: Deck["title"];
};

export type LessonFilters = { deckIds?: Deck["id"][] };

export type LessonAmounts = Record<LessonType, number>;

export type LessonTemplateLayoutItem = Modify<TemplateLayoutItem, {
  field: TemplateField | undefined;
}>;

export type LessonTemplate = Modify<Template, {
  layout: LessonTemplateLayoutItem[];
}>;

export type GetLessonDataParams = {
  filters: LessonFilters;
  amounts: LessonAmounts;
};

export type LessonData = {
  cards: Card[];
  decks: Deck[];
  templates: LessonTemplate[];
  algorithms: Algorithm[];
};

export type LessonResultData = {
  card: Card;
  review: InsertReviewData;
};
