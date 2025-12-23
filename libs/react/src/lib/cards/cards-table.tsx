import { cardsQueryKeys, queriesAtom, templatesQueryKeys } from "@koloda/react";
import type { Card, Deck, Template } from "@koloda/srs";
import { Table } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useAtomValue } from "jotai";
import { useMemo, useRef, useState } from "react";
import { AddCard } from "./add-card";
import { CardsTableCell } from "./cards-table-cell";
import { CardsViewToggle } from "./cards-view-toggle";

const PAGE_SIZES = [15, 20, 25];

const cell = (cell: CellContext<Card, unknown>) => <CardsTableCell cell={cell} />;

type CardsTableProps = {
  deckId: Deck["id"] | string;
  templateId: Template["id"] | string;
};

export function CardsTable({ deckId, templateId }: CardsTableProps) {
  const { _ } = useLingui();
  const { getCardsQuery, getCardsCountQuery, getTemplateQuery } = useAtomValue(queriesAtom);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZES[0] });
  const { data: cards = [] } = useQuery({
    queryKey: cardsQueryKeys.paginated({ deckId, page: pagination.pageIndex, pageSize: pagination.pageSize }),
    ...getCardsQuery({ deckId, page: pagination.pageIndex, pageSize: pagination.pageSize }),
    placeholderData: keepPreviousData,
  });
  const { data: totalCount = 0 } = useQuery({
    queryKey: cardsQueryKeys.count({ deckId }),
    ...getCardsCountQuery({ deckId }),
    placeholderData: keepPreviousData,
  });
  const { data: templateData } = useQuery({
    queryKey: templatesQueryKeys.detail(templateId),
    ...getTemplateQuery(templateId),
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
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(totalCount / pagination.pageSize),
    defaultColumn: {
      minSize: 32,
      maxSize: 1024,
    },
  });

  if (!templateData) return null;

  return (
    <>
      <div className="flex flex-row items-center justify-between gap-4">
        <CardsViewToggle />
        <AddCard deckId={Number(deckId)} templateId={Number(templateId)} />
      </div>
      <div className="flex flex-col gap-4" ref={wrapperRef}>
        <Table.Root>
          <Table.Head table={table} />
          <Table.Body table={table} />
        </Table.Root>
        <Table.Pagination table={table} pageSizes={PAGE_SIZES} totalCount={totalCount} />
      </div>
    </>
  );
}
