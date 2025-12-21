import { cardQueryKeys, DeckCards, deckQueryKeys, useTitle } from "@koloda/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_/decks/$deckId/cards")({
  component: DeckCardsRoute,
  loader: ({ context: { queryClient, queries }, params: { deckId } }) => {
    const { getDeckQuery, getCardsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: deckQueryKeys.detail(deckId), ...getDeckQuery(deckId) });
    queryClient.ensureQueryData({ queryKey: cardQueryKeys.all({ deckId }), ...getCardsQuery({ deckId }) });
  },
});

function DeckCardsRoute() {
  useTitle();
  const { deckId } = Route.useParams();

  return <DeckCards deckId={deckId} key={deckId} />;
}
