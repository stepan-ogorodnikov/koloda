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
      {/* WHY: React Query keeps prior data on a failed refetch, so blank/ok must not render beside the error. */}
      {!isError && data === "ok" && <Outlet />}
      {!isError && data === "blank" && <Setup />}
    </Layout>
  );
}
