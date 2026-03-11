import { queriesAtom, queryKeys } from "@koloda/react-base";
import type { Deck, GeneratedCard, Template } from "@koloda/srs";
import { transformGeneratedCards } from "@koloda/srs";
import { Table } from "@koloda/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type CellContext, type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { GeneratedCardsTableSelectCell } from "./generated-cards-table-select-cell";
import { GeneratedCardsTableSelectHeader } from "./generated-cards-table-select-header";

export type CardStatus = "idle" | "pending" | "success" | "error";

export type CardWithStatus = GeneratedCard & { status: CardStatus };

type UseGeneratedCardsTableOptions = {
  cards: GeneratedCard[];
  template: Template | null | undefined;
  deckId: Deck["id"];
  templateId: Template["id"];
};

export function useGeneratedCardsTable(options: UseGeneratedCardsTableOptions) {
  const { cards, template, deckId, templateId } = options;
  const queryClient = useQueryClient();
  const { addCardsMutation } = useAtomValue(queriesAtom);
  const mutation = useMutation(addCardsMutation());
  const [cardsWithStatus, setCardsWithStatus] = useState<CardWithStatus[]>(() =>
    cards.map((card) => ({ ...card, status: "idle" as const }))
  );

  const columns = useMemo<ColumnDef<CardWithStatus>[]>(() => {
    if (!template) return [];

    const selectionColumn: ColumnDef<CardWithStatus> = {
      id: "select",
      header: ({ table }) => <GeneratedCardsTableSelectHeader table={table} />,
      cell: ({ row }) => <GeneratedCardsTableSelectCell row={row} />,
      size: 2,
      minSize: 2,
      enableSorting: false,
    };

    const fieldColumns = (template.content?.fields || []).map((field) => ({
      id: field.id.toString(),
      header: field.title,
      accessorFn: (row: CardWithStatus) => row.content[field.id]?.text || "",
      cell: (cell: CellContext<CardWithStatus, unknown>) => (
        <Table.CellContent variants={{ class: "truncate" }}>
          {String(cell.getValue() ?? "")}
        </Table.CellContent>
      ),
      size: 16,
      minSize: 8,
    }));

    return [selectionColumn, ...fieldColumns];
  }, [template]);

  const table = useReactTable({
    data: cardsWithStatus,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (_, index) => index.toString(),
    enableRowSelection: (row) => row.original.status === "idle",
    initialState: {
      rowSelection: Object.fromEntries(cards.map((_, index) => [index.toString(), true])),
    },
    defaultColumn: {
      minSize: 8,
      size: 16,
      maxSize: 32,
    },
  });

  const selectedRowModel = table.getSelectedRowModel();
  const selectedIndices = selectedRowModel.rows.map((row) => row.index);
  const hasSelection = selectedIndices.length > 0;
  const isAdding = mutation.isPending;

  const updateCardsStatus = useCallback((indices: number[], status: CardStatus) => {
    setCardsWithStatus((prev) => prev.map((card, idx) => (indices.includes(idx) ? { ...card, status } : card)));
  }, []);

  const handleAddCards = useCallback(() => {
    if (!template || selectedIndices.length === 0) return;

    const cardsToCreate = selectedIndices
      .map((index) => cardsWithStatus[index])
      .filter((card): card is NonNullable<typeof card> => card !== undefined)
      .map((card) => transformGeneratedCards([card], deckId, templateId))
      .flat();

    if (cardsToCreate.length === 0) return;

    updateCardsStatus(selectedIndices, "pending");

    mutation.mutate(cardsToCreate, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.cards.deck({ deckId }) });
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail("ai") });
        updateCardsStatus(selectedIndices, "success");
        table.toggleAllRowsSelected(false);
      },
      onError: () => {
        updateCardsStatus(selectedIndices, "error");
      },
    });
  }, [template, selectedIndices, cardsWithStatus, deckId, templateId, mutation, queryClient, updateCardsStatus, table]);

  return {
    table,
    isAdding,
    hasSelection,
    handleAddCards,
  };
}
