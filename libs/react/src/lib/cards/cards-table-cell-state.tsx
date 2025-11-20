import { Table } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

const VALUES = [
  { t: msg`cards-table.state.untouched`, c: "fg-lesson-type-green" },
  { t: msg`cards-table.state.learn`, c: "fg-lesson-type-red" },
  { t: msg`cards-table.state.review`, c: "fg-lesson-type-blue" },
  { t: msg`cards-table.state.relearn`, c: "fg-lesson-type-red" },
];

type CardsTableCellStateProps = { value: number };

export function CardsTableCellState({ value }: CardsTableCellStateProps) {
  const { _ } = useLingui();

  if (!VALUES[value]) return null;

  return <Table.Cell variants={{ class: VALUES[value].c }}>{_(VALUES[value].t)}</Table.Cell>;
}
