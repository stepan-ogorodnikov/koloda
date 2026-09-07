import { Layout, QueryError } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { demoAppQueryOptions } from "../app/queries";
import { DemoSetup } from "./demo-setup";
import { Titlebar } from "./titlebar";

export function DemoAppEntry() {
  const { data, isError, error, refetch } = useQuery(demoAppQueryOptions);

  return (
    <Layout titlebar={<Titlebar />}>
      {isError && <QueryError error={error} onRetry={() => refetch()} />}
      {/* WHY: React Query keeps prior data on a failed refetch, so blank/ok must not render beside the error. */}
      {!isError && data === "blank" && <DemoSetup />}
      {!isError && data === "ok" && <Outlet />}
    </Layout>
  );
}
