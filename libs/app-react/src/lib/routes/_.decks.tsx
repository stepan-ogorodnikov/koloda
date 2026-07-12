import { queriesAtom, queryKeys, useTitle } from "@koloda/core-react";
import { AddDeck } from "@koloda/srs-react";
import { QueryState } from "@koloda/ui";
import { Layout, layoutSidebarItemLink, Link, useMotionSetting, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
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
  const { getDecksQuery } = useAtomValue(queriesAtom);
  const isMotionOn = useMotionSetting();
  const query = useQuery({ queryKey: queryKeys.decks.all(), ...getDecksQuery() });

  return (
    <>
      <Layout.Sidebar>
        <Layout.Header variants={{ type: "sidebar" }}>
          <Layout.H1>{_(msg`decks.title`)}</Layout.H1>
          <AddDeck />
        </Layout.Header>
        <Layout.Container ref={ref} tabIndex={-1}>
          <QueryState query={query}>
            {(data) => (
              <div className="flex flex-col">
                {data.map(({ id, title }) => (
                  <Layout.SidebarItem key={id}>
                    <Link
                      className={layoutSidebarItemLink}
                      to="/decks/$deckId"
                      params={{ deckId: id }}
                      viewTransition={isMotionOn}
                    >
                      <Layout.SidebarItemLinkContent>{title}</Layout.SidebarItemLinkContent>
                    </Link>
                  </Layout.SidebarItem>
                ))}
              </div>
            )}
          </QueryState>
        </Layout.Container>
      </Layout.Sidebar>
      <Layout.Content>
        <Outlet />
      </Layout.Content>
    </>
  );
}
