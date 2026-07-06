import { queriesAtom, queryKeys, useTitle } from "@koloda/core-react";
import { DeckCards } from "@koloda/srs-react";
import { DeckDetails } from "@koloda/srs-react";
import { NotFound, useLayoutHeaderScrollShadow } from "@koloda/ui";
import { QueryState } from "@koloda/ui";
import { Layout, Tabs, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
  useLayoutHeaderScrollShadow(ref);
  const id = Number(deckId);
  const { getDeckQuery } = useAtomValue(queriesAtom);
  const query = useQuery({ queryKey: queryKeys.decks.detail(id), ...getDeckQuery(id) });

  if ((query.isSuccess && query.data === null) || isNaN(id)) return <NotFound />;

  return (
    <Tabs defaultSelectedKey="cards">
      <Layout.Header>
        <Layout.H1 variants={{ grow: false }}>{query.data?.title}</Layout.H1>
        {query.data && (
          <Tabs.List aria-label={_(msg`deck.tabs.label`)}>
            {DECK_TABS.map(({ id, t }) => <Tabs.Tab id={id} key={id}>{_(t)}</Tabs.Tab>)}
          </Tabs.List>
        )}
      </Layout.Header>
      <Layout.Container ref={ref} tabIndex={-1}>
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
      </Layout.Container>
    </Tabs>
  );
}
