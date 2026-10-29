import { queriesAtom } from "@koloda/core-react";
import { DeckCards, DeckDetails } from "@koloda/srs-react";
import { Layout, NotFound, QueryState, Tabs, useLayoutHeaderScrollShadow, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

const deckRoute = getRouteApi("/decks/$deckId");

const DECK_TABS = [
  { id: "cards", label: msg`deck.tabs.cards` },
  { id: "details", label: msg`deck.tabs.details` },
];

export function DeckPage() {
  const { _ } = useLingui();
  const { deckId } = deckRoute.useParams();
  const ref = useRouteFocus(deckId);
  useLayoutHeaderScrollShadow(ref);
  const { getDeckQuery } = useAtomValue(queriesAtom);
  const query = useQuery(getDeckQuery(deckId));

  if (query.isSuccess && query.data === null) return <NotFound />;

  return (
    <Tabs defaultSelectedKey="cards">
      <Layout.Header>
        <Layout.H1 variants={{ isGrow: false }}>{query.data?.title}</Layout.H1>
        {query.data && (
          <Tabs.List aria-label={_(msg`deck.tabs.label`)}>
            {DECK_TABS.map(({ id, label }) => (
              <Tabs.Tab id={id} key={id}>
                {_(label)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        )}
      </Layout.Header>
      <Layout.Container ref={ref} tabIndex={-1}>
        <QueryState query={query}>
          {() => (
            <Tabs.Panels>
              <Tabs.Panel id="cards">
                <DeckCards deckId={deckId} key={deckId} />
              </Tabs.Panel>
              <Tabs.Panel id="details">
                <DeckDetails id={deckId} key={deckId} />
              </Tabs.Panel>
            </Tabs.Panels>
          )}
        </QueryState>
      </Layout.Container>
    </Tabs>
  );
}
