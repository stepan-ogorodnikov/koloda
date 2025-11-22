import { DeckDetails, useTitle } from "@koloda/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_/decks/$deckId/details")({
  component: DeckDetailsRoute,
  loader: ({ context: { queryClient, queries }, params: { deckId } }) => {
    const { getDeckQuery } = queries;
    queryClient.ensureQueryData({ queryKey: ["decks", deckId], ...getDeckQuery(deckId) });
  },
});

function DeckDetailsRoute() {
  useTitle();
  const { deckId } = Route.useParams();

  return <DeckDetails id={deckId} key={deckId} />;
}
