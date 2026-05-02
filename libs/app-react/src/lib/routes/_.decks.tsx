import { queriesAtom, queryKeys, useTitle } from "@koloda/react-base";
import { AddDeck } from "@koloda/srs-react";
import { QueryState } from "@koloda/ui";
import { Link, Main, mainSidebarItemLink, useMotionSetting, useRouteFocus } from "@koloda/ui";
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
    queryClient.ensureQueryData({ queryKey: queryKeys.decks.all(), ...getDecksQuery() });
    return { title: msg`title.decks` };
  },
});

function DecksRoute() {
  useTitle();
  const ref = useRouteFocus();
  const { _ } = useLingui();
  const { pathname } = useLocation();
  const { getDecksQuery } = useAtomValue(queriesAtom);
  const isMotionOn = useMotionSetting();
  const query = useQuery({ queryKey: queryKeys.decks.all(), ...getDecksQuery() });
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
        <Main.Container ref={ref} tabIndex={-1}>
          <QueryState query={query}>
            {(data) => (
              <div className="flex flex-col">
                {data.map(({ id, title }) => (
                  <Main.SidebarItem key={id}>
                    <Link
                      className={mainSidebarItemLink}
                      to="/decks/$deckId"
                      params={{ deckId: id }}
                      viewTransition={isMotionOn}
                    >
                      <Main.SidebarItemLinkContent>{title}</Main.SidebarItemLinkContent>
                    </Link>
                  </Main.SidebarItem>
                ))}
              </div>
            )}
          </QueryState>
        </Main.Container>
      </Main.Sidebar>
      <Main.Content hasContent={hasContent}>
        <Outlet />
      </Main.Content>
    </>
  );
}
