import { App, appMenu } from "@koloda/react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_")({
  component: RootLayout,
  loader: ({ location, context: { queryClient } }) => {
    const data = queryClient.getQueryData(["app"]);
    if (data === "ok" && location.pathname === "/") throw redirect({ to: appMenu[0].to });
  },
});

function RootLayout() {
  return (
    <App>
      <Outlet />
    </App>
  );
}
