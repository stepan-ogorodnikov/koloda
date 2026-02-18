import { queriesAtom, QueryState, reviewsQueryKeys } from "@koloda/react";
import { FSRS_GRADES } from "@koloda/srs";
import type { Card } from "@koloda/srs";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Fragment } from "react";

const TIMESTAMP_OPTIONS = {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as Intl.DateTimeFormatOptions;

type CardReviewsProps = { card: Card };

export function CardReviews({ card }: CardReviewsProps) {
  const { i18n, _ } = useLingui();
  const { getReviewsQuery } = useAtomValue(queriesAtom);
  const reviewsQuery = useQuery({
    queryKey: reviewsQueryKeys.card({ cardId: card.id }),
    ...getReviewsQuery({ cardId: card.id }),
  });

  if (!card.state) return null;

  return (
    <QueryState query={reviewsQuery}>
      {(reviews) =>
        !!reviews?.length && (
          <div className="grid grid-cols-[auto_1fr] gap-x-8">
            {reviews.map((review) => (
              <Fragment key={review.id}>
                <span className="py-2 fg-level-3">
                  {i18n.date(review.createdAt, TIMESTAMP_OPTIONS)}
                </span>
                <span className="py-2 font-semibold tracking-tight">
                  {_(FSRS_GRADES[review.rating - 1])}
                </span>
              </Fragment>
            ))}
          </div>
        )}
    </QueryState>
  );
}
