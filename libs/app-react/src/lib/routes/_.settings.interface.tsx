import { queryKeys, useTitle } from "@koloda/core-react";
import { BackButton, Main, useRouteFocus } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";
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
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <>
      <Main.Titlebar>
        {canGoBack && <BackButton onClick={() => router.history.back()} />}
        <Main.H1>{_(msg`settings.interface`)}</Main.H1>
      </Main.Titlebar>
      <Main.Container ref={ref} tabIndex={-1}>
        <SettingsInterface />
      </Main.Container>
    </>
  );
}
