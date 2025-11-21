import { NotFound, queriesAtom } from "@koloda/react";
import { Link, Main, tab, TabIndicator, tabLink } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/decks/$deckId")({
  component: DeckRoute,
  beforeLoad: ({ location, params }) => {
    if (location.pathname === `/decks/${params.deckId}`) {
      throw redirect({ to: "/decks/$deckId/details" });
    }
  },
  loader: ({ context: { queryClient, queries }, params: { deckId } }) => {
    const { getDeckQuery } = queries;
    queryClient.ensureQueryData({ queryKey: ["decks", deckId], ...getDeckQuery(deckId) });
  },
});

const DECK_TABS = [
  { to: "details", t: msg`deck.tabs.details` },
  { to: "cards", t: msg`deck.tabs.cards` },
];

function DeckRoute() {
  const { deckId } = Route.useParams();
  const { getDeckQuery } = useAtomValue(queriesAtom);
  const { data, isSuccess } = useQuery({ queryKey: ["decks", deckId], ...getDeckQuery(deckId) });

  if (isSuccess && data === null) return <NotFound />;

  if (!data) return null;

  return (
    <>
      <Main.Titlebar>
        {data?.title && (
          <>
            <Main.H2>{data.title}</Main.H2>
            <Main.Tabs>
              {DECK_TABS.map(({ to, t }) => (
                <Link className={tab} to={`/decks/$deckId/${to}`} params={{ deckId }} key={to}>
                  {({ isActive }) => (
                    <>
                      <span className={tabLink}>
                        <Trans id={t.id} message={t.message} />
                      </span>
                      {isActive && <TabIndicator id="deck-tabs" />}
                    </>
                  )}
                </Link>
              ))}
            </Main.Tabs>
          </>
        )}
      </Main.Titlebar>
      <Outlet />
    </>
  );
}
