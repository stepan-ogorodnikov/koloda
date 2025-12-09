import { App, appMenu, useTitle } from "@koloda/react";
import { msg } from "@lingui/core/macro";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_")({
  component: RootRoute,
  beforeLoad: ({ location, context: { queryClient } }) => {
    const data = queryClient.getQueryData(["app"]);
    if (data === "ok" && location.pathname === "/") throw redirect({ to: appMenu[0].to });
  },
  loader: () => ({ title: msg`title.base` }),
});

function RootRoute() {
  useTitle();

  return (
    <App>
      <Outlet />
    </App>
  );
}
