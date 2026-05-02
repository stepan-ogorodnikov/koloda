import type { GeneratedCard } from "@koloda/ai";
import type { Deck, Template } from "@koloda/srs";
import { Button, Table } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAIChatCardsTable } from "./use-ai-chat-cards-table";

type AIChatCardsTableProps = {
  cards: GeneratedCard[];
  template: Template | null | undefined;
  deckId: Deck["id"];
  templateId: Template["id"];
  canAdd: boolean;
  isGenerating: boolean;
};

export function AIChatCardsTable({
  cards,
  template,
  deckId,
  templateId,
  canAdd,
  isGenerating,
}: AIChatCardsTableProps) {
  const { _ } = useLingui();

  const { table, isAdding, hasSelection, handleAddCards } = useAIChatCardsTable({
    cards,
    template,
    deckId,
    templateId,
  });

  if (!template) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="w-full pb-2 overflow-x-auto">
        <Table.Root variants={{ class: "w-full" }}>
          <Table.Head table={table} />
          <Table.Body table={table} />
        </Table.Root>
      </div>
      <Button
        variants={{ style: "primary", class: "self-center min-w-60" }}
        isDisabled={!canAdd || isGenerating || isAdding || !hasSelection}
        onPress={handleAddCards}
      >
        {_(msg`ai-chat.add`)}
      </Button>
    </div>
  );
}
