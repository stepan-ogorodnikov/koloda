import type { LessonTableRow, LessonType } from "@koloda/srs";
import { Table } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { LessonBadge } from "./lesson-badge";

type LessonTableCellProps = {
  cell: {
    column: { id: string };
    row: { original: LessonTableRow };
    getValue: () => unknown;
  };
};

export function LessonsTableCell({ cell }: LessonTableCellProps) {
  const { _ } = useLingui();
  const {
    column: { id },
    row: { original },
  } = cell;
  const value = cell.getValue();

  if (id === "title") {
    return value === null ? (
      <Table.CellContent variants={{ type: "head" }}>{_(msg`lessons.table.columns.title.all`)}</Table.CellContent>
    ) : (
      <Table.CellContent>{String(value ?? "")}</Table.CellContent>
    );
  }

  return (
    <Table.CellContent variants={{ paddings: "none", size: "full", class: "overflow-visible" }}>
      <LessonBadge type={id as LessonType} value={value == null ? null : String(value)} deckId={original.id} />
    </Table.CellContent>
  );
}
