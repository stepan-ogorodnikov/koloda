import { useTitle } from "@koloda/core-react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { appMenu } from "../components/app";

export const Route = createFileRoute("/_/")({
  component: IndexRoute,
  beforeLoad: ({ location, context: { queryClient } }) => {
    const data = queryClient.getQueryData(["app"]);
    if (data === "ok" && location.pathname === "/_/") throw redirect({ to: appMenu[0].to, replace: true });
  },
});

function IndexRoute() {
  useTitle();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const data = queryClient.getQueryData(["app"]);

  useEffect(() => {
    if (data === "ok") navigate({ to: appMenu[0].to, replace: true });
  }, [data, navigate]);

  return null;
}
