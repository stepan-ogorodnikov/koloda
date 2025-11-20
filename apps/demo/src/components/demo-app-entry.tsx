import { Layout } from "@koloda/ui";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { demoAppQueryOptions } from "../app/queries";
import { DemoSetup } from "./demo-setup";

export function DemoAppEntry() {
  const { data } = useQuery(demoAppQueryOptions);

  return (
    <Layout>
      {data === "blank" && <DemoSetup />}
      {data === "ok" && <Outlet />}
    </Layout>
  );
}
