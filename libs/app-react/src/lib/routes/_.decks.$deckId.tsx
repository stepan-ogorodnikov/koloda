import { queriesAtom, queryKeys, useTitle } from "@koloda/core-react";
import { DeckCards } from "@koloda/srs-react";
import { DeckDetails } from "@koloda/srs-react";
import { NotFound } from "@koloda/ui";
import { QueryState } from "@koloda/ui";
import { BackButton, Main, Tabs, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/decks/$deckId")({
  component: DeckRoute,
  loader: ({ context: { queryClient, queries }, params: { deckId } }) => {
    const id = Number(deckId);
    const { getDeckQuery, getCardsQuery, getAIProfilesQuery } = queries;
    queryClient.ensureQueryData({ queryKey: queryKeys.decks.detail(id), ...getDeckQuery(id) });
    queryClient.ensureQueryData({ queryKey: queryKeys.cards.deck({ deckId: id }), ...getCardsQuery({ deckId: id }) });
    queryClient.ensureQueryData({ queryKey: queryKeys.ai.profiles(), ...getAIProfilesQuery() });
  },
});

const DECK_TABS = [
  { id: "details", t: msg`deck.tabs.details` },
  { id: "cards", t: msg`deck.tabs.cards` },
];

function DeckRoute() {
  useTitle();
  const { _ } = useLingui();
  const { deckId } = Route.useParams();
  const ref = useRouteFocus(deckId);
  const id = Number(deckId);
  const router = useRouter();
  const { getDeckQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: queryKeys.decks.detail(id), ...getDeckQuery(id) });

  if ((query.isSuccess && query.data === null) || isNaN(id)) return <NotFound />;

  return (
    <Tabs defaultSelectedKey="cards">
      <Main.Titlebar>
        <BackButton onClick={() => router.navigate({ to: "/decks" })} />
        <Main.H2>{query.data?.title}</Main.H2>
        {query.data && (
          <Tabs.List aria-label={_(msg`deck.tabs.label`)}>
            {DECK_TABS.map(({ id, t }) => <Tabs.Tab id={id} key={id}>{_(t)}</Tabs.Tab>)}
          </Tabs.List>
        )}
      </Main.Titlebar>
      <Main.Container ref={ref} tabIndex={-1}>
        <QueryState query={query}>
          {() => (
            <Tabs.Panels>
              <Tabs.Panel id="details">
                <DeckDetails id={id} />
              </Tabs.Panel>
              <Tabs.Panel id="cards">
                <DeckCards deckId={id} />
              </Tabs.Panel>
            </Tabs.Panels>
          )}
        </QueryState>
      </Main.Container>
    </Tabs>
  );
}
