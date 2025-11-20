import type { Card, Deck, Template } from "@koloda/srs";
import { Table } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useAtomValue } from "jotai";
import { useMemo, useRef } from "react";
import { queriesAtom } from "../queries";
import { CardsTableCell } from "./cards-table-cell";

const cell = (cell: CellContext<Card, unknown>) => <CardsTableCell cell={cell} />;

type CardsTableProps = {
  deckId: Deck["id"] | string;
  templateId: Template["id"] | string;
};

export function CardsTable({ deckId, templateId }: CardsTableProps) {
  const { _ } = useLingui();
  const { getCardsQuery, getTemplateQuery } = useAtomValue(queriesAtom);
  const { data: cards = [] } = useQuery({ queryKey: ["cards", `${deckId}`], ...getCardsQuery({ deckId }) });
  const { data: templateData } = useQuery({
    queryKey: ["templates", `${templateId}`],
    ...getTemplateQuery(`${templateId}`),
  });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const columns = useMemo<ColumnDef<Card>[]>(
    () =>
      [
        (templateData?.content?.fields || []).map((field) => (
          { accessorKey: `content.${field.id}.text`, header: field.title, cell }
        )),
        {
          accessorKey: "state",
          header: _(msg`cards.table.columns.state`),
          size: 8,
          cell,
        },
        {
          accessorKey: "dueAt",
          header: _(msg`cards.table.columns.due-at`),
          size: 14,
          cell,
        },
        {
          accessorKey: "createdAt",
          header: _(msg`cards.table.columns.created-at`),
          size: 14,
          cell,
        },
        {
          id: "delete",
          header: "",
          minSize: 4,
          size: 4,
          cell,
        },
      ].flat(),
    [_, templateData?.content?.fields],
  );

  const table = useReactTable({
    columns,
    data: cards,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    defaultColumn: {
      minSize: 32,
      maxSize: 1024,
    },
  });

  if (!templateData) return null;

  return (
    <div ref={wrapperRef}>
      <Table.Root>
        <Table.Head table={table} />
        <Table.Body table={table} />
      </Table.Root>
    </div>
  );
}
