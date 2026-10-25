import { queriesAtom } from "@koloda/core-react";
import type { Card, Deck, Template } from "@koloda/srs";
import { QueryError, SearchField, Table, createCardsColumnHelper, useCardsTable } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnVisibilityState, RowSelectionState } from "@tanstack/react-table";
import { useAtomValue } from "jotai";
import { AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CardsTableCell } from "./cards-table-cell";
import { CardsTableColumnsVisibility } from "./cards-table-columns-visibility";
import { CardsTableFilters } from "./cards-table-filters";
import { CardsTableHeaderSelect } from "./cards-table-header-select";
import { CardsTableSelectionControls } from "./cards-table-selection-controls";
import { getCardsTableContentColumns } from "./cards-table-utility";
import { useCardsTemplates } from "./use-cards-templates";

const PAGE_SIZES = [15, 20, 25];

const columnHelper = createCardsColumnHelper<Card>();

type CardState = NonNullable<Card["state"]>;

type CardsTableProps = {
  deckId: Deck["id"];
  controlsNode: HTMLDivElement | null;
};

export function CardsTable({ deckId, controlsNode }: CardsTableProps) {
  const { _ } = useLingui();
  const { getCardsQuery, getDeckQuery } = useAtomValue(queriesAtom);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZES[0] });
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({
    templateId: false,
    createdAt: false,
    updatedAt: false,
  });
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    state: [] as CardState[],
    dueAt: { isOverdue: false, isNotDue: false },
    templateIds: [] as Template["id"][],
  });
  const [searchValue, setSearchValue] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const { data: cards = [] } = useQuery(getCardsQuery({ deckId }));
  const { data: deck } = useQuery(getDeckQuery(deckId));
  const { templates, templateMapRef, isReady, templateError, refetchTemplates } = useCardsTemplates(
    cards,
    deck?.templateId,
  );

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: "select",
          header: ({ table }) => <CardsTableHeaderSelect table={table} />,
          size: 2,
          minSize: 2,
          enableHiding: false,
          enableSorting: false,
          cell: (cell) => <CardsTableCell cell={cell} />,
        }),
        ...getCardsTableContentColumns(templates).map((field) =>
          columnHelper.accessor(
            (row) => {
              const template = templateMapRef.current.get(row.templateId);
              const fieldId = field.getFieldId(template);
              return fieldId ? (row.content[fieldId]?.text ?? "") : "";
            },
            {
              id: `content.field.${field.index}`,
              header: field.header,
              cell: (cell) => <CardsTableCell cell={cell} />,
            },
          ),
        ),
        columnHelper.accessor("state", {
          header: _(msg`cards.table.columns.state`),
          enableGlobalFilter: false,
          filterFn: (row, columnId, filterValue: CardState[]) =>
            filterValue.length === 0 || filterValue.includes(row.getValue(columnId)),
          size: 8,
          cell: (cell) => <CardsTableCell cell={cell} />,
        }),
        columnHelper.accessor("dueAt", {
          header: _(msg`cards.table.columns.due-at`),
          enableGlobalFilter: false,
          filterFn: (row, columnId, filterValue: { isOverdue: boolean; isNotDue: boolean }) => {
            const value = row.getValue<Card["dueAt"]>(columnId);
            const isDue = value ? new Date(value).getTime() <= new Date().getTime() : false;
            const isNotDue = !value || new Date(value) > new Date();
            if (filterValue.isOverdue && filterValue.isNotDue) return true;
            if (filterValue.isOverdue) return isDue;
            if (filterValue.isNotDue) return isNotDue;
            return true;
          },
          size: 14,
          cell: (cell) => <CardsTableCell cell={cell} />,
        }),
        // WHY: the template filter is a column filter so selection treats it like the others:
        // hidden rows stay selected but drop out of the count and the bulk delete.
        columnHelper.accessor("templateId", {
          enableHiding: false,
          enableGlobalFilter: false,
          enableSorting: false,
          filterFn: (row, columnId, filterValue: Template["id"][]) =>
            filterValue.length === 0 || filterValue.includes(row.getValue(columnId)),
        }),
        columnHelper.accessor("createdAt", {
          header: _(msg`cards.table.columns.created-at`),
          enableGlobalFilter: false,
          size: 14,
          cell: (cell) => <CardsTableCell cell={cell} />,
        }),
        columnHelper.accessor("updatedAt", {
          header: _(msg`cards.table.columns.updated-at`),
          enableGlobalFilter: false,
          size: 14,
          cell: (cell) => <CardsTableCell cell={cell} />,
        }),
        columnHelper.display({
          id: "preview",
          header: "",
          enableHiding: false,
          enableGlobalFilter: false,
          minSize: 4,
          size: 4,
          cell: (cell) => <CardsTableCell cell={cell} />,
        }),
        columnHelper.display({
          id: "edit",
          header: "",
          enableHiding: false,
          enableGlobalFilter: false,
          minSize: 4,
          size: 4,
          cell: (cell) => <CardsTableCell cell={cell} />,
        }),
        columnHelper.display({
          id: "delete",
          header: "",
          enableHiding: false,
          enableGlobalFilter: false,
          minSize: 4,
          size: 4,
          cell: (cell) => <CardsTableCell cell={cell} />,
        }),
      ]),
    [_, templates, templateMapRef],
  );

  const table = useCardsTable({
    columns,
    data: cards,
    getRowId: (row) => row.id,
    state: {
      pagination,
      columnVisibility,
      columnOrder,
      columnFilters: [
        { id: "state", value: filters.state },
        { id: "dueAt", value: filters.dueAt },
        { id: "templateId", value: filters.templateIds },
      ],
      rowSelection,
    },
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onRowSelectionChange: setRowSelection,
    globalFilterFn: "includesString",
    defaultColumn: {
      minSize: 32,
      maxSize: 1024,
    },
  });

  // WHY: `autoResetPageIndex` is off (cardsTableOptions), so the table keeps the page across refetches.
  // A shorter list (delete, refetch) would leave it past the last page, empty with no page buttons.
  const lastPageIndex = Math.max(0, table.getPageCount() - 1);
  if (pagination.pageIndex > lastPageIndex) setPagination({ ...pagination, pageIndex: lastPageIndex });

  const updateFilters: typeof setFilters = (value) => {
    setFilters(value);
    table.setPageIndex(0);
  };

  const updateSearch = (value: string) => {
    setSearchValue(value);
    table.setGlobalFilter(value);
    table.setPageIndex(0);
  };

  const selectedIds = table.getFilteredSelectedRowModel().rows.map((row) => row.original.id);

  if (templateError && !isReady) return <QueryError error={templateError} onRetry={refetchTemplates} />;
  if (!isReady) return null;

  return (
    <>
      {controlsNode &&
        createPortal(
          <div className="grow flex flex-row items-center gap-4">
            <CardsTableFilters filters={filters} setFilters={updateFilters} templates={templates} />
            <CardsTableColumnsVisibility
              columns={table.getAllColumns()}
              onColumnVisibilityChange={(columnId, isVisible) => table.getColumn(columnId)?.toggleVisibility(isVisible)}
              onColumnOrderChange={(newOrder) => setColumnOrder(newOrder)}
            />
            <div className="grow" />
            <SearchField
              aria-label={_(msg`cards-table.search.label`)}
              value={searchValue}
              onChange={(value) => updateSearch(value as string)}
              onKeyDown={(e) => e.continuePropagation()}
            >
              <SearchField.Group>
                <SearchField.Icon />
                <SearchField.Input placeholder={_(msg`cards-table.search.placeholder`)} />
                <SearchField.ClearButton isHidden={!searchValue} onClick={() => updateSearch("")} />
              </SearchField.Group>
            </SearchField>
          </div>,
          controlsNode,
        )}
      <div className="flex flex-col gap-4">
        <Table.Root>
          <Table.Head table={table} />
          <Table.Body table={table} />
        </Table.Root>
        <Table.Pagination table={table} pageSizes={PAGE_SIZES} />
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <CardsTableSelectionControls
              selectedIds={selectedIds}
              deckId={deckId}
              onClearSelection={() => setRowSelection({})}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
