import type { GetReviewsData } from "@koloda/srs";

export const reviewsQueryKeys = {
  card: (data: GetReviewsData) => ["reviews", String(data.cardId)] as const,
} as const;
