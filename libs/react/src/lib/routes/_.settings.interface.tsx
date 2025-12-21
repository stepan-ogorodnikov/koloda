import { SettingsInterface, settingQueryKeys, useTitle } from "@koloda/react";
import { BackButton, Main } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/_/settings/interface")({
  component: SettingsInterfaceRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getSettingsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: settingQueryKeys.detail("interface"), ...getSettingsQuery("interface") });
    return { title: msg`title.settings.interface` };
  },
});

function SettingsInterfaceRoute() {
  useTitle();
  const { _ } = useLingui();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <>
      <Main.Titlebar>
        {canGoBack && <BackButton onClick={() => router.history.back()} />}
        <Main.H1>{_(msg`settings.interface`)}</Main.H1>
      </Main.Titlebar>
      <SettingsInterface />
    </>
  );
}
