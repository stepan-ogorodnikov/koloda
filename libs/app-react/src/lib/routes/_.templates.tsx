import { queriesAtom, queryKeys, useTitle } from "@koloda/core-react";
import { AddTemplate } from "@koloda/srs-react";
import { QueryState } from "@koloda/ui";
import { Link, Main, mainSidebarItemLink, useMotionSetting, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/_/templates")({
  component: TemplatesRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getTemplatesQuery } = queries;
    queryClient.ensureQueryData({ queryKey: queryKeys.templates.all(), ...getTemplatesQuery() });
    return { title: msg`title.templates` };
  },
});

function TemplatesRoute() {
  useTitle();
  const ref = useRouteFocus();
  const { _ } = useLingui();
  const { pathname } = useLocation();
  const { getTemplatesQuery } = useAtomValue(queriesAtom);
  const isMotionOn = useMotionSetting();
  const query = useQuery({ queryKey: queryKeys.templates.all(), ...getTemplatesQuery() });
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
        <Main.Container ref={ref} tabIndex={-1}>
          <QueryState query={query}>
            {(data) => (
              <div className="flex flex-col">
                {data.map(({ id, title }) => (
                  <Main.SidebarItem key={id}>
                    <Link
                      className={mainSidebarItemLink}
                      to="/templates/$templateId"
                      params={{ templateId: id }}
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
