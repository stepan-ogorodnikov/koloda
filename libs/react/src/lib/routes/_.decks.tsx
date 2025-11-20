import { AddDeck, queriesAtom } from "@koloda/react";
import { Link, Main, mainSidebarItemLink } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/decks")({
  component: DecksRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getDecksQuery } = queries;
    queryClient.ensureQueryData({ queryKey: ["decks"], ...getDecksQuery() });
  },
});

export function DecksRoute() {
  const { _ } = useLingui();
  const { getDecksQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: ["decks"], ...getDecksQuery() });

  return (
    <>
      <Main.Sidebar>
        <Main.Titlebar>
          <Main.H1>
            {_(msg`decks.title`)}
          </Main.H1>
          <AddDeck />
        </Main.Titlebar>
        {data
          ? data.map(({ id, title }) => (
            <Main.SidebarItem key={id}>
              <Link className={mainSidebarItemLink} to="/decks/$deckId" params={{ deckId: id }}>
                <Main.SidebarItemLinkContent>{title}</Main.SidebarItemLinkContent>
              </Link>
            </Main.SidebarItem>
          ))
          : null}
      </Main.Sidebar>
      <Main.Content>
        <Outlet />
      </Main.Content>
    </>
  );
}
