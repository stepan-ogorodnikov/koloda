import { Layout } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { demoAppQueryOptions } from "../app/queries";
import { DemoSetup } from "./demo-setup";
import { Titlebar } from "./titlebar";

export function DemoAppEntry() {
  const { data } = useQuery(demoAppQueryOptions);

  return (
    <Layout titlebar={<Titlebar />}>
      {data === "blank" && <DemoSetup />}
      {data === "ok" && <Outlet />}
    </Layout>
  );
}
