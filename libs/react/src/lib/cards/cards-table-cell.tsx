import type { Card } from "@koloda/srs";
import { Table } from "@koloda/ui";
import { useLingui } from "@lingui/react";
import type { CellContext } from "@tanstack/react-table";
import { isDate } from "date-fns";
import { CardState } from "./card-state";
import { CardsTableCellDeleteCard } from "./cards-table-cell-delete-card";

const TIMESTAMP_OPTIONS = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
} as Intl.DateTimeFormatOptions;

type CardsTableCellProps = { cell: CellContext<Card, any> };

export function CardsTableCell({ cell }: CardsTableCellProps) {
  const { i18n } = useLingui();
  const { row: { original: card }, column: { id }, getValue } = cell;
  const value = getValue();
  const isDateValue = isDate(value);
  const formatted = isDateValue ? i18n.date(value, TIMESTAMP_OPTIONS) : value;

  if (id === "delete") return <CardsTableCellDeleteCard id={card.id} deckId={card.deckId} />;

  if (id === "state") {
    return (
      <Table.Cell>
        <CardState value={value as number} />
      </Table.Cell>
    );
  }

  return <Table.Cell variants={isDateValue ? { class: "fg-level-4" } : undefined}>{formatted}</Table.Cell>;
}
