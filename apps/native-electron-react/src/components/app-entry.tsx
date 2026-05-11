import { Layout } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { appQueryOptions } from "../app/queries";
import { ElectronTitlebar } from "./electron-titlebar";
import { Setup } from "./setup";

export function AppEntry() {
  const { data } = useQuery(appQueryOptions);

  return (
    <Layout titlebar={<ElectronTitlebar />}>
      {data === "ok" && <Outlet />}
      {data === "blank" && <Setup />}
    </Layout>
  );
}
