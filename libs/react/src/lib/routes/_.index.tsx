import { appMenu, useTitle } from "@koloda/react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_/")({
  component: IndexRoute,
  beforeLoad: ({ location, context: { queryClient } }) => {
    const data = queryClient.getQueryData(["app"]);
    if (data === "ok" && location.pathname === "/_/") throw redirect({ to: appMenu[0].to });
  },
});

function IndexRoute() {
  useTitle();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const data = queryClient.getQueryData(["app"]);
  if (data === "ok") navigate({ to: appMenu[0].to });

  return null;
}
