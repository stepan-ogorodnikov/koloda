import { queriesAtom } from "@koloda/core-react";
import { AddDeck } from "@koloda/srs-react";
import { Layout, layoutSidebarItemLink, Link, QueryState, useMotionSetting, useRouteFocus } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export function DecksPage() {
  const ref = useRouteFocus();
  const { getDecksQuery } = useAtomValue(queriesAtom);
  const isMotionOn = useMotionSetting();
  const query = useQuery(getDecksQuery());

  return (
    <>
      <Layout.Sidebar>
        <Layout.Header variants={{ type: "sidebar" }}>
          <Layout.H1>Decks</Layout.H1>
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
