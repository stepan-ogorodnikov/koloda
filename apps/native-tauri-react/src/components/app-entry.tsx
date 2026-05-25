import { Layout } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { appQueryOptions } from "../app/queries";
import { Setup } from "./setup";
import { Titlebar } from "./titlebar";

export function AppEntry() {
  const { data } = useQuery(appQueryOptions);

  return (
    <>
      <Titlebar />
      <Layout variants={{ class: "pt-(--titlebar-height)" }}>
        {data === "ok" && <Outlet />}
        {data === "blank" && <Setup />}
      </Layout>
    </>
  );
}
