import { BadgeAlertIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { GeneratedCard } from "@koloda/ai";
import type { Deck, Template } from "@koloda/srs";
import { Button, Table } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { CardStatus } from "../state/conversation-reducer";
import { useAssistantCardsTable } from "./use-assistant-cards-table";

type AssistantCardsTableProps = {
  runId: string;
  cards: GeneratedCard[];
  cardStatuses: Record<number, CardStatus>;
  template: Template;
  deckId: Deck["id"] | null;
  templateId: Template["id"] | undefined;
  canAdd: boolean;
  isGenerating: boolean;
  isTemplateUnavailable?: boolean;
};

export function AssistantCardsTable({
  runId,
  cards,
  cardStatuses,
  template,
  deckId,
  templateId,
  canAdd,
  isGenerating,
  isTemplateUnavailable = false,
}: AssistantCardsTableProps) {
  const { _ } = useLingui();

  const { table, isAdding, hasSelection, handleAddCards } = useAssistantCardsTable({
    runId,
    cards,
    cardStatuses,
    template,
    deckId,
    templateId,
    enableSelection: !isTemplateUnavailable,
  });

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="w-full pb-2 overflow-x-auto">
        <Table.Root variants={{ class: "w-full" }}>
          <Table.Head table={table} />
          <Table.Body table={table} />
        </Table.Root>
      </div>
      {isTemplateUnavailable ? (
        <p className="self-center flex items-center justify-center gap-2 min-w-60 fg-level-3">
          <HugeiconsIcon className="size-5 min-w-5" strokeWidth={1.75} icon={BadgeAlertIcon} aria-hidden="true" />
          {_(msg`assistant.template-unavailable`)}
        </p>
      ) : (
        <Button
          variants={{ style: "primary", class: "self-center min-w-60" }}
          isDisabled={!canAdd || isGenerating || isAdding || !hasSelection}
          onPress={handleAddCards}
        >
          {_(msg`assistant.add`)}
        </Button>
      )}
    </div>
  );
}
