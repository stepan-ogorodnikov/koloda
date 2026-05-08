import { Layout } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { appQueryOptions } from "../app/queries";
import { NativeTitlebar } from "./native-titlebar";
import { Setup } from "./setup";

export function AppEntry() {
  const { data } = useQuery(appQueryOptions);

  return (
    <Layout titlebar={<NativeTitlebar />}>
      {data === "ok" && <Outlet />}
      {data === "blank" && <Setup />}
    </Layout>
  );
}
