import type { GetLessonDataParams, LessonFilters } from "@koloda/srs";

export const lessonQueryKeys = {
  all: (filters?: LessonFilters) => ["lessons", { filters }] as const,
  data: (params: GetLessonDataParams) => ["lesson_data", params] as const,
  todayReviewTotals: () => ["today_review_totals"] as const,
} as const;
