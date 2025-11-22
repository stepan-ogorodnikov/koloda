import { AddTemplate, queriesAtom, useTitle } from "@koloda/react";
import { Link, Main, mainSidebarItemLink } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/templates")({
  component: TemplatesRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getTemplatesQuery } = queries;
    queryClient.ensureQueryData({ queryKey: ["templates"], ...getTemplatesQuery() });
    return { title: msg`title.templates` };
  },
});

export function TemplatesRoute() {
  useTitle();
  const { _ } = useLingui();
  const { getTemplatesQuery } = useAtomValue(queriesAtom);
  const { data } = useQuery({ queryKey: ["templates"], ...getTemplatesQuery() });

  return (
    <>
      <Main.Sidebar>
        <Main.Titlebar>
          <Main.H1>
            {_(msg`templates.title`)}
          </Main.H1>
          <AddTemplate />
        </Main.Titlebar>
        {data
          ? data.map(({ id, title }) => (
            <Main.SidebarItem key={id}>
              <Link className={mainSidebarItemLink} to="/templates/$templateId" params={{ templateId: id }}>
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
