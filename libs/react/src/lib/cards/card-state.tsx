import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

export const VALUES = [
  { t: msg`card.state.untouched`, cn: "border-fg-lesson-type-blue bg-lesson-type-blue/25 fg-lesson-type-blue" },
  { t: msg`card.state.learn`, cn: "border-fg-lesson-type-red bg-lesson-type-red/10 fg-lesson-type-red" },
  { t: msg`card.state.review`, cn: "border-fg-lesson-type-green bg-lesson-type-green/10 fg-lesson-type-green" },
  { t: msg`card.state.relearn`, cn: "border-fg-lesson-type-red bg-lesson-type-red/10 fg-lesson-type-red" },
];

const cn = "inline-flex px-1 rounded-md border-2 font-bold tracking-tighter whitespace-nowrap";

type CardStateProps = { value: number };

export function CardState({ value }: CardStateProps) {
  const { _ } = useLingui();

  if (!VALUES[value]) return null;

  return <div className={[VALUES[value].cn, cn].join(" ")}>{_(VALUES[value].t)}</div>;
}
