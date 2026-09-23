import { useTimestampFormatter } from "@koloda/core-react";
import type { Card } from "@koloda/srs";
import { Table } from "@koloda/ui";
import type { CardsTableFeatures } from "@koloda/ui";
import type { CellContext } from "@tanstack/react-table";
import { isDate } from "date-fns";
import { CardState } from "./card-state";
import { CardsTableCellDeleteCard } from "./cards-table-cell-delete-card";
import { CardsTableCellEditCard } from "./cards-table-cell-edit-card";
import { CardsTableCellPreviewCard } from "./cards-table-cell-preview-card";
import { CardsTableCellSelect } from "./cards-table-cell-select";

type CardsTableCellProps = { cell: CellContext<CardsTableFeatures, Card, any> };

export function CardsTableCell({ cell }: CardsTableCellProps) {
  const formatTimestamp = useTimestampFormatter();
  const {
    row: { original: card },
    column: { id },
  } = cell;
  const value = cell.getValue();
  const isDateValue = isDate(value);
  const isTimestampColumn = ["dueAt", "createdAt", "updatedAt"].includes(id);
  const formatted = isTimestampColumn && value ? formatTimestamp(value, "date") : value;

  if (id === "select") return <CardsTableCellSelect row={cell.row} />;
  if (id === "preview") return <CardsTableCellPreviewCard card={card} />;
  if (id === "edit") return <CardsTableCellEditCard card={card} />;
  if (id === "delete") return <CardsTableCellDeleteCard id={card.id} deckId={card.deckId} />;

  if (id === "state") {
    return (
      <Table.CellContent>
        <CardState value={value as number} />
      </Table.CellContent>
    );
  }

  return (
    <Table.CellContent variants={isDateValue ? { class: "fg-level-4" } : undefined}>{formatted}</Table.CellContent>
  );
}
