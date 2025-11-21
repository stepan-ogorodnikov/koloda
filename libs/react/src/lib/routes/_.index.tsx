import { appMenu } from "@koloda/react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_/")({
  component: IndexRoute,
  loader: ({ location, context: { queryClient } }) => {
    const data = queryClient.getQueryData(["app"]);
    if (data === "ok" && location.pathname === "/_/") throw redirect({ to: appMenu[0].to });
  },
});

function IndexRoute() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const data = queryClient.getQueryData(["app"]);
  if (data === "ok") navigate({ to: appMenu[0].to });

  return null;
}
