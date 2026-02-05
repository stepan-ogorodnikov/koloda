import { AddDeck, decksQueryKeys, queriesAtom, QueryState, useTitle } from "@koloda/react";
import { Link, Main, mainSidebarItemLink, useMotionSetting } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/decks")({
  component: DecksRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getDecksQuery } = queries;
    queryClient.ensureQueryData({ queryKey: decksQueryKeys.all(), ...getDecksQuery() });
    return { title: msg`title.decks` };
  },
});

function DecksRoute() {
  useTitle();
  const { _ } = useLingui();
  const { pathname } = useLocation();
  const { getDecksQuery } = useAtomValue(queriesAtom);
  const isMotionOn = useMotionSetting();
  const query = useQuery({ queryKey: decksQueryKeys.all(), ...getDecksQuery() });
  const hasContent = !(pathname === "/decks" || pathname === "/decks/");

  return (
    <>
      <Main.Sidebar hasContent={hasContent}>
        <Main.Titlebar>
          <Main.H1>
            {_(msg`decks.title`)}
          </Main.H1>
          <AddDeck />
        </Main.Titlebar>
        <QueryState query={query}>
          {(data) => (
            <div className="flex flex-col">
              {data.map(({ id, title }) => (
                <Main.SidebarItem key={id}>
                  <Link className={mainSidebarItemLink} to="/decks/$deckId" params={{ deckId: id }} viewTransition={isMotionOn}>
                    <Main.SidebarItemLinkContent>{title}</Main.SidebarItemLinkContent>
                  </Link>
                </Main.SidebarItem>
              ))}
            </div>
          )}
        </QueryState>
      </Main.Sidebar>
      <Main.Content hasContent={hasContent}>
        <Outlet />
      </Main.Content>
    </>
  );
}
