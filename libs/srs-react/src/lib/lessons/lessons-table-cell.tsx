import type { Lesson, LessonType } from "@koloda/srs";
import { Table } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { CellContext } from "@tanstack/react-table";
import { LessonBadge } from "./lesson-badge";

type LessonTableCellProps = { cell: CellContext<Lesson, any> };

export function LessonsTableCell({ cell }: LessonTableCellProps) {
  const { _ } = useLingui();
  const { column: { id }, row: { original }, getValue } = cell;
  const value = getValue();

  if (id === "title") {
    return value === null
      ? <Table.CellContent variants={{ type: "head" }}>{_(msg`lessons.table.columns.title.all`)}</Table.CellContent>
      : <Table.CellContent>{value}</Table.CellContent>;
  }

  return (
    <Table.CellContent variants={{ paddings: "none", size: "full", class: "overflow-visible" }}>
      <LessonBadge type={id as LessonType} value={value} deckId={original.id} />
    </Table.CellContent>
  );
}
