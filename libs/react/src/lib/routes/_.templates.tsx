import { AddTemplate, queriesAtom, templatesQueryKeys, useTitle } from "@koloda/react";
import { Link, Main, mainSidebarItemLink, useMotionSetting } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/templates")({
  component: TemplatesRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getTemplatesQuery } = queries;
    queryClient.ensureQueryData({ queryKey: templatesQueryKeys.all(), ...getTemplatesQuery() });
    return { title: msg`title.templates` };
  },
});

function TemplatesRoute() {
  useTitle();
  const { _ } = useLingui();
  const { pathname } = useLocation();
  const { getTemplatesQuery } = useAtomValue(queriesAtom);
  const isMotionOn = useMotionSetting();
  const { data } = useQuery({ queryKey: templatesQueryKeys.all(), ...getTemplatesQuery() });
  const hasContent = !(pathname === "/templates" || pathname === "/templates/");

  return (
    <>
      <Main.Sidebar hasContent={hasContent}>
        <Main.Titlebar>
          <Main.H1>
            {_(msg`templates.title`)}
          </Main.H1>
          <AddTemplate />
        </Main.Titlebar>
        {data
          ? data.map(({ id, title }) => (
            <Main.SidebarItem key={id}>
              <Link className={mainSidebarItemLink} to="/templates/$templateId" params={{ templateId: id }} viewTransition={isMotionOn}>
                <Main.SidebarItemLinkContent>{title}</Main.SidebarItemLinkContent>
              </Link>
            </Main.SidebarItem>
          ))
          : null}
      </Main.Sidebar>
      <Main.Content hasContent={hasContent}>
        <Outlet />
      </Main.Content>
    </>
  );
}
