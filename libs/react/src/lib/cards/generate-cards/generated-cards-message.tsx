import { AIChatMessageLayout } from "@koloda/react";
import type { GeneratedCard, Template } from "@koloda/srs";
import { Table } from "@koloda/ui";
import { Button } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import type { AddCardsMutationResult } from "./use-generate-cards-dialog";

export type GeneratedCardsMessageProps = {
  cards: GeneratedCard[];
  template: Template | null | undefined;
  modelName?: string;
  onAddCards: () => void;
  canCreate: boolean;
  isCreating: boolean;
  isGenerating: boolean;
  mutationResult: AddCardsMutationResult | null;
};

export function GeneratedCardsMessage({
  cards,
  template,
  modelName,
  onAddCards,
  canCreate,
  isCreating,
  isGenerating,
  mutationResult,
}: GeneratedCardsMessageProps) {
  const { _ } = useLingui();
  const label = modelName ?? _(msg`ai.chat.roles.assistant`);

  const columns = useMemo<ColumnDef<GeneratedCard>[]>(() => (
    (template?.content?.fields || []).map((field) => ({
      id: field.id.toString(),
      header: field.title,
      accessorFn: (row: GeneratedCard) => row.content[field.id]?.text || "",
      cell: (cell) => (
        <Table.CellContent variants={{ class: "truncate" }}>
          {String(cell.getValue() ?? "")}
        </Table.CellContent>
      ),
    }))
  ), [template]);

  const table = useReactTable({
    data: cards,
    columns,
    getCoreRowModel: getCoreRowModel(),
    defaultColumn: {
      minSize: 8,
      size: 16,
      maxSize: 32,
    },
  });

  if (!template) return null;

  return (
    <AIChatMessageLayout role="assistant" label={label}>
      {isGenerating
        ? (
          <span className="self-start animate-shimmer-text--fg-level-4/fg-level-1">
            {_(msg`generate-cards.generating`)}
          </span>
        )
        : (
          <div className="flex flex-col gap-2">
            {cards.length > 0
              ? (
                <>
                  <div className="w-full overflow-x-auto">
                    <Table.Root variants={{ class: "w-full" }}>
                      <Table.Head table={table} />
                      <Table.Body table={table} />
                    </Table.Root>
                  </div>
                  <Button
                    variants={{ style: "primary", size: "small", class: "self-start" }}
                    isDisabled={!canCreate || isCreating || !!mutationResult}
                    onPress={onAddCards}
                  >
                    {_(msg`generate-cards.add`)}
                  </Button>
                  {mutationResult && (
                    <p className={mutationResult.type === "success" ? "fg-success" : "fg-error"}>
                      {mutationResult.message}
                    </p>
                  )}
                </>
              )
              : (
                <p className="fg-level-3">
                  {_(msg`generate-cards.generated-no-cards`)}
                </p>
              )}
          </div>
        )}
    </AIChatMessageLayout>
  );
}
