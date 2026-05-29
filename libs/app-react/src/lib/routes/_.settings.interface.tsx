import { queryKeys, useTitle } from "@koloda/core-react";
import { Layout, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { createFileRoute } from "@tanstack/react-router";
import { SettingsInterface } from "../settings/settings-interface";

export const Route = createFileRoute("/_/settings/interface")({
  component: SettingsInterfaceRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getSettingsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: queryKeys.settings.detail("interface"), ...getSettingsQuery("interface") });
    return { title: msg`title.settings.interface` };
  },
});

function SettingsInterfaceRoute() {
  useTitle();
  const ref = useRouteFocus();
  const { _ } = useLingui();

  return (
    <>
      <Layout.Header>
        <Layout.H1>{_(msg`settings.interface`)}</Layout.H1>
      </Layout.Header>
      <Layout.Container ref={ref} tabIndex={-1}>
        <SettingsInterface />
      </Layout.Container>
    </>
  );
}
