import { Layout, QueryError } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { appQueryOptions } from "../app/queries";
import { Titlebar } from "./titlebar";
import { Setup } from "./setup";

export function AppEntry() {
  const { data, isError, error, refetch } = useQuery(appQueryOptions);

  return (
    <Layout titlebar={<Titlebar />}>
      {isError && <QueryError error={error} onRetry={() => refetch()} />}
      {data === "ok" && <Outlet />}
      {data === "blank" && <Setup />}
    </Layout>
  );
}
