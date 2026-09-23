import { queriesAtom, useTimestampFormatter } from "@koloda/core-react";
import { FSRS_GRADES } from "@koloda/srs";
import type { Card } from "@koloda/srs";
import { QueryState } from "@koloda/ui";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Fragment } from "react";

type CardReviewsProps = { card: Card };

export function CardReviews({ card }: CardReviewsProps) {
  const { _ } = useLingui();
  const formatTimestamp = useTimestampFormatter();
  const { getReviewsQuery } = useAtomValue(queriesAtom);
  const reviewsQuery = useQuery(getReviewsQuery({ cardId: card.id }));

  if (!card.state) return null;

  return (
    <QueryState query={reviewsQuery}>
      {(reviews) =>
        !!reviews?.length && (
          <div className="grid grid-cols-[auto_1fr] gap-x-8">
            {reviews.map((review) => (
              <Fragment key={review.id}>
                <span className="py-2 fg-level-3">{formatTimestamp(review.createdAt, "datetime")}</span>
                <span className="py-2 font-semibold tracking-tight">{_(FSRS_GRADES[review.rating - 1])}</span>
              </Fragment>
            ))}
          </div>
        )
      }
    </QueryState>
  );
}
