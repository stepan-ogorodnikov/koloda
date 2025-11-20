import type { Card } from "@koloda/srs";
import { Table } from "@koloda/ui";
import { useLingui } from "@lingui/react";
import type { CellContext } from "@tanstack/react-table";
import { isDate } from "date-fns";
import { CardsTableCellDeleteCard } from "./cards-table-cell-delete-card";
import { CardsTableCellState } from "./cards-table-cell-state";

type CardsTableCellProps = { cell: CellContext<Card, any> };

export function CardsTableCell({ cell }: CardsTableCellProps) {
  const { i18n } = useLingui();
  const { row: { original: card }, column: { id }, getValue } = cell;
  const value = getValue();
  const isDateValue = isDate(value);
  const formatted = isDateValue ? i18n.date(value) : value;

  if (id === "delete") return <CardsTableCellDeleteCard id={card.id} deckId={card.deckId} />;
  if (id === "state") return <CardsTableCellState value={value as number} />;

  return <Table.Cell variants={isDateValue ? { class: "fg-level-4" } : undefined}>{formatted}</Table.Cell>;
}
