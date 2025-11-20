import type { Lesson, LessonType } from "@koloda/srs";
import { Table, tableHeadCell } from "@koloda/ui";
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
      ? <span className={tableHeadCell()}>{_(msg`lessons.table.columns.title.all`)}</span>
      : <Table.Cell>{value}</Table.Cell>;
  }

  return <LessonBadge type={id as LessonType} value={value} deckId={original.id} />;
}
