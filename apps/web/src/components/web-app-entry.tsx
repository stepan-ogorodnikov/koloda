import { Layout, QueryError } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { webAppQueryOptions } from "../app/queries";
import { WebSetup } from "./web-setup";
import { Titlebar } from "./titlebar";

export function WebAppEntry() {
  const { data, isError, error, refetch } = useQuery(webAppQueryOptions);

  return (
    <Layout titlebar={<Titlebar />}>
      {isError && <QueryError error={error} onRetry={() => refetch()} />}
      {/* WHY: React Query keeps prior data on a failed refetch, so blank/ok must not render beside the error. */}
      {!isError && data === "blank" && <WebSetup />}
      {!isError && data === "ok" && <Outlet />}
    </Layout>
  );
}
