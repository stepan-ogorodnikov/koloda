import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { tv } from "tailwind-variants";

export const VALUES = [
  { t: msg`card.state.untouched`, state: "untouched" },
  { t: msg`card.state.learn`, state: "learn" },
  { t: msg`card.state.review`, state: "review" },
  { t: msg`card.state.relearn`, state: "relearn" },
] as const;

const cardState = tv({
  base: "inline-flex px-1 rounded-md border-2 font-bold tracking-tighter whitespace-nowrap",
  variants: {
    state: {
      untouched: "border-fg-lesson-type-blue bg-lesson-type-blue/25 fg-lesson-type-blue",
      learn: "border-fg-lesson-type-red bg-lesson-type-red/10 fg-lesson-type-red",
      review: "border-fg-lesson-type-green bg-lesson-type-green/10 fg-lesson-type-green",
      relearn: "border-fg-lesson-type-red bg-lesson-type-red/10 fg-lesson-type-red",
    },
  },
});

type CardStateProps = { value: number };

export function CardState({ value }: CardStateProps) {
  const { _ } = useLingui();

  if (!VALUES[value]) return null;

  return <div className={cardState({ state: VALUES[value].state })}>{_(VALUES[value].t)}</div>;
}
