import { SettingsHotkeys, settingsQueryKeys, useTitle } from "@koloda/react";
import { BackButton, Main } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/_/settings/hotkeys")({
  component: SettingsHotkeysRoute,
  loader: ({ context: { queryClient, queries } }) => {
    const { getSettingsQuery } = queries;
    queryClient.ensureQueryData({ queryKey: settingsQueryKeys.detail("hotkeys"), ...getSettingsQuery("hotkeys") });
    return { title: msg`title.settings.hotkeys` };
  },
});

function SettingsHotkeysRoute() {
  useTitle();
  const { _ } = useLingui();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <>
      <Main.Titlebar>
        {canGoBack && <BackButton onClick={() => router.history.back()} />}
        <Main.H1>{_(msg`settings.hotkeys`)}</Main.H1>
      </Main.Titlebar>
      <SettingsHotkeys />
    </>
  );
}
