import { DeckCards, decksQueryKeys, useTitle } from "@koloda/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_/decks/$deckId/cards")({
  component: DeckCardsRoute,
  loader: ({ context: { queryClient, queries }, params: { deckId } }) => {
    const { getDeckQuery } = queries;
    queryClient.ensureQueryData({ queryKey: decksQueryKeys.detail(deckId), ...getDeckQuery(deckId) });
  },
});

function DeckCardsRoute() {
  useTitle();
  const { deckId } = Route.useParams();

  return <DeckCards deckId={deckId} key={deckId} />;
}
