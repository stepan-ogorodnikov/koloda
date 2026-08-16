import { queriesAtom } from "@koloda/core-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";
import type { ResolveDataAccess } from "./runs/data-access";
import { DATA_ACCESS_CARD_LIST_CHAR_BUDGET, serializeDeckCards, serializeDeckSummaries } from "./runs/data-access";

export type UseAssistantDataAccessReturn = {
  resolve: ResolveDataAccess;
};

/**
 * Resolves the per-run data access snapshot (deck summaries, write-target cards)
 * at submit time. Reads go through the query client at call time — never a
 * render-time snapshot — so submits always see current data.
 */
export function useAssistantDataAccess(): UseAssistantDataAccessReturn {
  const queryClient = useQueryClient();
  const readQueries = useAtomCallback((get) => get(queriesAtom));

  const resolve = useCallback<ResolveDataAccess>(
    async (mode, deckId) => {
      const queries = readQueries();
      // WHY: per-deck card queries are the only card-count source in the
      // Queries contract; the write target reuses its entry instead of refetching.
      const decks = (await queryClient.ensureQueryData(queries.getDecksQuery())) ?? [];
      const templates = await queryClient.ensureQueryData(queries.getTemplatesQuery());
      const cardsPerDeck = await Promise.all(
        decks.map((deck) => queryClient.ensureQueryData(queries.getCardsQuery({ deckId: deck.id }))),
      );

      const summaries = serializeDeckSummaries(
        decks.map((deck, index) => ({
          id: deck.id,
          title: deck.title,
          templateId: deck.templateId,
          cardCount: cardsPerDeck[index].length,
        })),
        templates,
      );

      // INVARIANT: chat runs never include card contents — summaries only.
      if (mode === "chat") {
        return { context: summaries.context, manifest: { decks: summaries.decks, writeTarget: null } };
      }

      const writeDeckIndex = deckId === null ? -1 : decks.findIndex((deck) => deck.id === deckId);
      const writeDeck = writeDeckIndex === -1 ? null : decks[writeDeckIndex];
      const writeCards = writeDeckIndex === -1 ? [] : cardsPerDeck[writeDeckIndex];
      const writeTemplate = writeDeck ? templates.find((t) => t.id === writeDeck.templateId) : undefined;

      // WHY: a write target without a resolvable template cannot format card
      // fields; it degrades to `isMissing` rather than crashing on field-less
      // serialization. The deck→template FK makes this a data-integrity edge.
      const serializedCards = serializeDeckCards(
        writeDeck && writeTemplate ? { id: writeDeck.id, title: writeDeck.title, template: writeTemplate } : null,
        writeCards,
        DATA_ACCESS_CARD_LIST_CHAR_BUDGET,
      );

      return {
        context: [summaries.context, serializedCards.context].filter(Boolean).join("\n\n"),
        manifest: { decks: summaries.decks, writeTarget: serializedCards.writeTarget },
      };
    },
    [queryClient, readQueries],
  );

  return { resolve };
}
