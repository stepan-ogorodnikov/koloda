import { DeckCards } from "@koloda/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_/decks/$deckId/cards")({
  component: DeckCardsRoute,
  loader: ({ context: { queryClient, queries }, params: { deckId } }) => {
    const { getDeckQuery, getCardsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: ["decks", deckId], ...getDeckQuery(deckId) });
    queryClient.ensureQueryData({ queryKey: ["cards", deckId], ...getCardsQuery({ deckId }) });
  },
});

function DeckCardsRoute() {
  const { deckId } = Route.useParams();

  return <DeckCards deckId={deckId} key={deckId} />;
}
